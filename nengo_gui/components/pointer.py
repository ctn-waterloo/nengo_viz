import collections
import copy
import struct

import nengo
import nengo.spa
from nengo.spa.module import Module
import numpy as np

from nengo_gui.components.component import Component


class Pointer(Component):
    config_defaults = dict(show_pairs=False, **Component.config_defaults)
    def __init__(self, obj, **kwargs):
        super(Pointer, self).__init__()
        self.obj = obj
        self.data = collections.deque()
        # toggles whether to use semantic pointer value
        # as set by the user in the GUI
        self.override_target = None
        self.target = kwargs.get('args', 'default')
        self.vocab_out = obj.outputs[self.target][1]
        self.vocab_in = obj.inputs[self.target][1]

    def attach(self, page, config, uid):
        super(Pointer, self).attach(page, config, uid)
        self.label = page.get_label(self.obj)
        self.vocab_out.include_pairs = config.show_pairs

    def add_nengo_objects(self, page):
        with page.model:
            output = self.obj.outputs[self.target][0]
            input = self.obj.inputs[self.target][0]
            self.node = nengo.Node(self.gather_data,
                                   size_in=self.vocab_out.dimensions,
                                   size_out=self.vocab_in.dimensions)
            self.conn1 = nengo.Connection(output, self.node, synapse=0.01)
            self.conn2 = nengo.Connection(self.node, input, synapse=0.01)

    def remove_nengo_objects(self, page):
        page.model.connections.remove(self.conn1)
        page.model.connections.remove(self.conn2)
        page.model.nodes.remove(self.node)

    def gather_data(self, t, x):
        vocab = self.vocab_out
        key_similarity = np.dot(vocab.vectors, x)
        matches = [(simi, vocab.keys[i]) for i, simi in enumerate(key_similarity) if simi > 0.01]
        if self.config.show_pairs:
            self.vocab_out.include_pairs = True
            pair_similarity = np.dot(vocab.vector_pairs, x)
            pair_matches = [(simi, vocab.key_pairs[i]) for i, simi in enumerate(pair_similarity)
                        if simi > 0.01]
            matches += pair_matches

        text = ';'.join(['%0.2f%s' % (sim, key) for (sim, key) in matches])

        # msg sent as a string due to variable size of pointer names
        msg = '%g %s' % (t, text)
        self.data.append(msg)
        if self.override_target is None:
            return self.vocab_in.parse('0').v
        else:
            v = (self.override_target.v - x) * 3
            if self.vocab_in is not self.vocab_out:
                v = np.dot(self.vocab_out.transform_to(self.vocab_in), v)
            return v

    def update_client(self, client):
        while len(self.data) > 0:
            data = self.data.popleft()
            client.write(data, binary=False)

    def javascript(self):
        info = dict(uid=id(self), label=self.label)
        json = self.javascript_config(info)
        return 'new Nengo.Pointer(main, sim, %s);' % json

    def code_python_args(self, uids):
        return [uids[self.obj], 'target=%r' % self.target]

    # Override the value if set
    def message(self, msg):
        if msg == ':empty:':
            self.override_target = None
        elif msg[0:12] == ':check only:':
            if len(msg) == 12:
                self.data.append("good_pointer")
            else:                
                vocab = copy.deepcopy(self.vocab_out)
                try:
                    vocab.parse(msg[12:])
                    self.data.append("good_pointer")
                except:
                    self.data.append("bad_pointer")            
        else:
            try:
                self.override_target = self.vocab_out.parse(msg)
            except:
                self.override_target = None

    @staticmethod
    def applicable_targets(obj):
        if isinstance(obj, Module):
            return list(obj.outputs.keys())
        else:
            return []
