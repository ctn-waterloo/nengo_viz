import importlib
import inspect
import json
import logging
import os
import re
import socket
import threading
import time
import traceback

import nengo
import nengo_gui
import nengo_gui.config
import nengo_gui.seed_generation
import nengo_gui.user_action


class PageSettings(object):
    __slots__ = ["backend", "editor_class", "filename_cfg"]

    def __init__(
        self,
        filename_cfg=None,
        backend="nengo",
        editor_class=nengo_gui.components.AceEditor,
    ):
        self.filename_cfg = filename_cfg
        self.backend = backend
        self.editor_class = editor_class


class Page(object):
    """A handler for a single page of the nengo_gui.

    Parameters
    ----------

    gui : nengo_gui.GUI
        The main GUI
    filename : str
        The filename to open.  If this is the same as gui.filename
        then it will use the existing gui.model and gui.locals
        (if available).  Otherwise, the file will be executed to generate
        the model
    settings : PageSettings
        Configures page behaviour (editor, backend, etc)
    reset_cfg : bool, optional
        If True, the existing .cfg file will be erased
    """

    # Some Simulators can only have one instance running at a time
    singleton_sims = dict(nengo_spinnaker=None)

    def __init__(self, gui, filename, settings, reset_cfg=False):
        self.gui = gui
        self.settings = settings

        self.code = None  # the code for the model
        self.model = None  # the nengo.Network
        self.locals = None  # the locals() dictionary after executing
        self.last_good_locals = None  # the locals dict for the last time
        # this script was run without errors
        self.error = None  # any error message generated
        self.stdout = ""  # text sent to stdout during execution

        self.changed = False  # has the model been changed?
        self.finished = False  # should this Page be shut down
        self._sim = None  # the current nengo.Simulator
        self.rebuild = False  # should the model be rebuilt
        self.sims_to_close = []  # list of sims that should be closed

        self.code = None  # the source code currently displayed
        self.error = None  # any execute or build error
        self.stdout = ""  # text printed during execute+build

        self.undo_stack = []
        self.redo_stack = []

        # placeholders for attributes that will be created by self.load()
        self.name_finder = None  # NameFinder from nengo objects to text
        self.default_labels = None  # dict of names to use for unlabelled objs
        self.config = None  # nengo_gui.Config for storing layout
        self.components = None  # list of Components
        self.uid_prefix_counter = None  # used for generating uids for components
        self.component_uids = None  # mapping from Components to text

        self.config_save_needed = False
        self.config_save_time = None  # time of last config file save
        self.config_save_period = 2.0  # minimum time between saves

        self.keys_pressed = set()
        self.key_codes_pressed = set()

        self.lock = threading.Lock()

        # use the default filename if none is given
        if filename is None:
            self.filename = gui.model_context.filename
        else:
            try:
                self.filename = os.path.relpath(filename)
            except ValueError:
                # happens on Windows if filename is on a different
                # drive than the current directory
                self.filename = filename

        if self.filename is None and self.gui.model_context.model is None:
            raise ValueError("no model provided")

        # determine the .cfg filename
        if self.settings.filename_cfg is None and self.filename is not None:
            self.filename_cfg = self.filename + ".cfg"
        else:
            self.filename_cfg = self.settings.filename_cfg

        if reset_cfg:
            self.clear_config()

        self.load()

        self.net_graph = self.get_component(nengo_gui.components.NetGraph)
        self.editor = self.get_component(self.settings.editor_class)

        # build and run the model in a separate thread
        t = threading.Thread(target=self.runner)
        t.daemon = True
        t.start()

    @property
    def sim(self):
        return self._sim

    @sim.setter
    def sim(self, value):
        if hasattr(self._sim, "close"):
            self.sims_to_close.append(self._sim)
        self._sim = value

    def get_component(self, component_class):
        for c in self.components:
            if isinstance(c, component_class):
                return c
        return None

    def clear_config(self):
        if os.path.isfile(self.filename_cfg):
            os.remove(self.filename_cfg)

    def load(self):
        """Load the model and initialize everything"""
        if self.filename == self.gui.model_context.filename:
            # if we're on the default filename, just load it from the GUI
            self.model = self.gui.model_context.model
            if self.gui.model_context.locals is None:
                self.locals = None
            else:
                self.locals = self.gui.model_context.locals.copy()
        else:
            self.model = None
            self.locals = None

        # if we still don't have a locals dictionary, then run the script
        if self.locals is None:
            try:
                with open(self.filename) as f:
                    code = f.read()
            except IOError:
                code = ""

            self.execute(code)

        if self.model is None:
            self.model = nengo.Network()
            self.locals["model"] = self.model

        # figure out good names for objects
        self.name_finder = nengo_gui.NameFinder(self.locals, self.model)
        self.default_labels = self.name_finder.known_name

        # load the .cfg file
        self.config = self.load_config()
        self.config_save_needed = False
        self.config_save_time = None  # time of last config file save

        self.uid_prefix_counter = {}

        self.create_components()

    def create_components(self):
        """Generate the actual Components from the Templates"""
        # TODO: change the name of this
        self.components = []
        self.component_uids = {}
        for name, obj in self.locals.items():
            if isinstance(obj, nengo_gui.components.Component):
                self.component_uids[obj] = name
                self.gui.component_uids[id(obj)] = obj
                self.components.append(obj)

        # this ensures NetGraph, AceEditor, and SimControl are first
        self.components.sort(key=lambda x: x.component_order)

    def add_component(self, component):
        """Add a new Component to an existing Page."""
        self.gui.component_uids[id(component)] = component
        uid = self.get_uid(component)
        component.attach(self, self.config[component], uid=uid)
        self.components.append(component)

    def execute(self, code):
        """Run the given code to generate self.model and self.locals.

        The code will be stored in self.code, any output to stdout will
        be a string as self.stdout, and any error will be in self.error.
        """
        code_locals = {}
        code_locals["nengo_gui"] = nengo_gui
        code_locals["__file__"] = self.filename
        code_locals["__page__"] = self

        self.code = code
        self.error = None
        self.stdout = ""

        exec_env = nengo_gui.exec_env.ExecutionEnvironment(self.filename)
        try:
            with exec_env:
                compiled = compile(code, nengo_gui.exec_env.compiled_filename, "exec")
                exec(compiled, code_locals)
        except nengo_gui.exec_env.StartedSimulatorException:
            line = nengo_gui.exec_env.determine_line_number()
            exec_env.stdout.write(
                "Warning: Simulators cannot be manually"
                " run inside nengo_gui (line %d)\n" % line
            )
            exec_env.stdout.write(
                "\nIf you are running a Nengo script from"
                " a tutorial, this may be a tutorial\nthat"
                " should be run in a Python interpreter,"
                " rather than in the Nengo GUI.\nSee"
                ' <a href="https://nengo.github.io/users.html"'
                '  target="_blank">https://nengo.github.io/users.html</a>'
                " for more details.\n"
            )
        except nengo_gui.exec_env.StartedGUIException:
            line = nengo_gui.exec_env.determine_line_number()
            exec_env.stdout.write(
                "Warning: nengo_gui cannot be run inside"
                " nengo_gui (line %d)\n" % line
            )
        except:
            line = nengo_gui.exec_env.determine_line_number()
            self.error = dict(trace=traceback.format_exc(), line=line)
        self.stdout = exec_env.stdout.getvalue()

        # make sure we've defined a nengo.Network
        model = code_locals.get("model", None)
        if not isinstance(model, nengo.Network):
            if self.error is None:
                line = len(code.split("\n"))
                self.error = dict(
                    trace="must declare a nengo.Network " 'called "model"', line=line
                )
            model = None

        self.model = model
        self.locals = code_locals
        if self.error is None:
            self.last_good_locals = code_locals

    def load_config(self):
        """Load the .cfg file"""
        config = nengo_gui.config.Config()
        self.locals["nengo_gui"] = nengo_gui
        self.locals["_viz_config"] = config
        fname = self.filename_cfg

        # force flush the config cache before loading it
        self.save_config(lazy=False)
        if os.path.exists(fname):
            with open(fname) as f:
                config_code = f.readlines()
            for line in config_code:
                try:
                    exec(line, self.locals)
                except Exception:
                    # FIXME
                    # if self.gui.interactive:
                    logging.debug("error parsing config: %s", line)

        # make sure the required Components exist
        if "_viz_sim_control" not in self.locals:
            c = nengo_gui.components.SimControl()
            self.locals["_viz_sim_control"] = c
        if "_viz_net_graph" not in self.locals:
            c = nengo_gui.components.NetGraph()
            self.locals["_viz_net_graph"] = c

        # Scrap legacy editor in config
        if "_viz_ace_editor" in self.locals:
            del self.locals["_viz_ace_editor"]
        # Always use the editor given in page settings, do not rely on config
        self.locals["_viz_editor"] = self.settings.editor_class()

        if "_viz_progress" not in self.locals:
            self.locals["_viz_progress"] = nengo_gui.components.Progress()

        if self.model is not None:
            if config[self.model].pos is None:
                config[self.model].pos = (0, 0)
            if config[self.model].size is None:
                config[self.model].size = (1.0, 1.0)

        for k, v in self.locals.items():
            if isinstance(v, nengo_gui.components.Component):
                self.default_labels[v] = k
                v.attach(page=self, config=config[v], uid=k)

        return config

    def save_config(self, lazy=False, force=False):
        """Write the .cfg file to disk.

        Parameters
        ----------
        lazy : bool
            If True, then only save if it has been more than config_save_time
            since the last save and if config_save_needed
        force : bool
            If True, then always save right now
        """
        if not force and not self.config_save_needed:
            return

        now_time = time.time()
        if not force and lazy and self.config_save_time is not None:
            if (now_time - self.config_save_time) < self.config_save_period:
                return

        with self.lock:
            self.config_save_time = now_time
            self.config_save_needed = False
            try:
                with open(self.filename_cfg, "w") as f:
                    f.write(self.config.dumps(uids=self.default_labels))
            except IOError:
                print("Could not save %s; permission denied" % self.filename_cfg)

    def modified_config(self):
        """Set a flag that the config file should be saved."""
        self.config_save_needed = True

    def create_javascript(self):
        """Generate the javascript for the current model and layout."""
        if self.filename is not None:
            fn = json.dumps(self.filename)
            webpage_title_js = ";document.title = %s;" % fn
        else:
            webpage_title_js = ""

        assert isinstance(self.components[0], nengo_gui.components.SimControl)

        component_js = "\n".join([c.javascript() for c in self.components])
        component_js += webpage_title_js
        if not self.gui.model_context.writeable:
            component_js += "$('#Open_file_button').addClass('deactivated');"
        return component_js

    def get_label(self, obj, default_labels=None):
        """Return a readable label for an object.

        If the object has a .label set, this will be used.  Otherwise, it
        uses default_labels, which thanks to the NameFinder will be legal
        Python code for referring to the object given the current locals()
        dictionary ("model.ensembles[1]" or "ens" or "model.buffer.state".
        If it has to use default_labels, it will only use the last part of the
        label (after the last ".").  This avoids redundancy in nested displays.
        """
        if default_labels is None:
            default_labels = self.default_labels
        label = obj.label
        if label is None:
            label = default_labels.get(obj, None)
            # We should never ask for the label for something that can't be
            # found in the default_labels.  If this does happen, something
            # has gone wrong.  Note that this was often a symptom of the
            # dreaded 'pop' bug that causes hassles during the summer school.
            # Hopefully the reorganization of the code into Page and GUI
            # (from Viz and VizSim) has dealt with this problem.
            assert label is not None
            if "." in label:
                label = label.rsplit(".", 1)[1]
        if re.match(r"networks\[\d+\]", label) and obj.__class__.__name__ != "Network":
            label = obj.__class__.__name__
        return label

    def get_uid(self, obj, default_labels=None):
        """Return a unique identifier for an object.

        This should be the value given by the NameFinder.
        """
        if default_labels is None:
            default_labels = self.default_labels
        uid = default_labels.get(obj, None)
        if uid is None:
            # TODO: do we ever need to fall back on this case?  This should
            # only happen if something goes wrong.
            uid = repr(obj)
        return uid

    def finish(self):
        """Shut down this page."""
        if not self.finished:
            self.finished = True
            self.gui.remove_page(self)

    def generate_uid(self, obj, prefix):
        """Make a new unique identifier for an object.

        This is used for new Components being created (so they can have
        a unique identifier in the .cfg file).
        """
        index = self.uid_prefix_counter.get(prefix, 0)
        uid = "%s%d" % (prefix, index)
        while uid in self.locals:
            index += 1
            uid = "%s%d" % (prefix, index)
        self.uid_prefix_counter[prefix] = index + 1

        self.locals[uid] = obj
        self.default_labels[obj] = uid

    def remove_uid(self, uid):
        """Remove a generated uid (for when a component is removed)."""
        if uid in self.locals:
            obj = self.locals[uid]
            del self.locals[uid]
            del self.default_labels[obj]
        else:
            print("WARNING: remove_uid called on unknown uid: %s" % uid)

    def remove_component(self, component):
        """Remove a component from the layout."""
        del self.gui.component_uids[id(component)]
        self.remove_uid(component.uid)
        self.components.remove(component)

    def config_change(self, component, new_cfg, old_cfg):
        act = nengo_gui.user_action.ConfigAction(
            self, component=component, new_cfg=new_cfg, old_cfg=old_cfg
        )
        self.undo_stack.append([act])

    def remove_graph(self, component):
        act = nengo_gui.user_action.RemoveGraph(self.net_graph, component)
        self.undo_stack.append([act])

    def build(self):
        """Build the model."""
        # use the lock to make sure only one Simulator is building at a time
        # TODO: should there be a master lock in the GUI?
        with self.lock:
            self.building = True

            # set all the seeds so that creating components doesn't affect
            #  the neural model itself
            seeds = nengo_gui.seed_generation.define_all_seeds(self.model)
            for obj, s in seeds.items():
                obj.seed = s

            # modify the model for the various Components
            for c in self.components:
                c.add_nengo_objects(self)

            # determine the backend to use
            backend = importlib.import_module(self.settings.backend)
            # if only one Simulator is allowed at a time, finish the old one
            old_sim = Page.singleton_sims.get(self.settings.backend, None)
            if old_sim is not None and old_sim is not self:
                old_sim.sim = None
                old_sim.finished = True

            exec_env = nengo_gui.exec_env.ExecutionEnvironment(
                self.filename, allow_sim=True
            )
            handles_progress = (
                "progress_bar" in inspect.getargspec(backend.Simulator.__init__).args
            )
            # build the simulation
            try:
                with exec_env:
                    if handles_progress:
                        self.sim = backend.Simulator(
                            self.model, progress_bar=self.locals["_viz_progress"]
                        )
                    else:
                        self.sim = backend.Simulator(self.model)

            except:
                line = nengo_gui.exec_env.determine_line_number()
                self.error = dict(trace=traceback.format_exc(), line=line)

            # set the defined seeds back to None
            for obj in seeds:
                obj.seed = None

            self.stdout += exec_env.stdout.getvalue()

            if self.sim is not None:
                if self.settings.backend in Page.singleton_sims:
                    Page.singleton_sims[self.settings.backend] = self
                if "on_start" in self.locals:
                    self.locals["on_start"](self.sim)

            # remove the temporary components added for visualization
            for c in self.components:
                c.remove_nengo_objects(self)
            # TODO: add checks to make sure everything's been removed

            self.building = False
            self.rebuild = False

    def runner(self):
        """Separate thread for running the simulation itself."""
        # run the simulation
        while not self.finished:
            if self.sim is None:
                time.sleep(0.01)
            else:
                try:
                    if hasattr(self.sim, "max_steps"):
                        # this is only for the nengo_spinnaker simulation
                        self.sim.run_steps(self.sim.max_steps)
                    else:
                        self.sim.step()
                        if "on_step" in self.locals:
                            self.locals["on_step"](self.sim)
                except Exception as err:
                    if self.finished:
                        return
                    line = nengo_gui.exec_env.determine_line_number()
                    self.error = dict(trace=traceback.format_exc(), line=line)
                    self.sim = None
            while self.sims_to_close:
                s = self.sims_to_close.pop()
                if "on_close" in self.locals:
                    self.locals["on_close"](s)
                s.close()

            if self.rebuild:
                self.build()
        self.sim = None

    def close(self):
        if self.sim is not None:
            if "on_close" in self.locals:
                self.locals["on_close"](self.sim)
