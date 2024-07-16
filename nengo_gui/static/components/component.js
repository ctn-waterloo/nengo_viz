/**
 * Base class for interactive visualization
 * Components (value/raster/XY plots, sliders, etc...) will inherit from
 * this class.
 *
 * @constructor
 *
 * @param {dict} args - A set of constructor arguments, including:
 * @param {DOMElement} args.parent - the element to add this component to
 * @param {float} args.x - the left side of the component (in pixels)
 * @param {float} args.y - the top of the component (in pixels)
 * @param {float} args.width - the width of the component (in pixels)
 * @param {float} args.height - the height of the component (in pixels)
 * @param {boolean} args.label_visible - whether the label should be shown
 * @param {int} args.id - the id of the server-side component to connect to
 *
 * Component is inherited by specific component 
 * class prototypes (ie. Slider, Value)
 *
 */
Nengo.Component = function(parent, args) {
    var self = this;

    this.viewport = viewport;

    /** Create the div for the component and position it */
    this.div = document.createElement('div');

    /** Prevent interact from messing up cursor */
    interact(this.div).styleCursor(true);

    this.x = args.x;
    this.y = args.y;
    this.w = args.width;
    this.h = args.height;

    this.redraw_size();
    this.redraw_pos();

    this.div.style.position = 'absolute';
    this.div.setAttribute('data-object-type', 'graph')
    this.div.classList.add('graph');
    parent.appendChild(this.div);
    this.parent = parent;

    this.label = document.createElement('div');
    this.label.classList.add('label', 'unselectable');
    this.label.innerHTML = args.label.replace('<', '&lt;').replace('>', '&gt;');
    this.label.style.position = 'fixed';
    this.label.style.width = args.width;
    this.label.style.height = '2em';
    this.label_visible = true;
    this.div.appendChild(this.label);
    if (args.label_visible === false) {
        this.hide_label();
    }

    self.minWidth = 2;
    self.minHeight = 2;

    /** Move element to be drawn on top when clicked on */

    this.div.onmousedown = function() {
        this.style.zIndex = Nengo.next_zindex();
    };

    this.div.ontouchstart = this.div.onmousedown;

    /** Allow element to be dragged */
    interact(this.div)
        .draggable({
            inertia: true,
            onstart: function () {
                self.menu.hide_any();
            },
            onmove: function (event) {
                if (Nengo.netgraph.capture_move_event(event)) {
                    return;
                }

                var target = event.target;

                self.x = self.x + event.dx / (self.viewport.w * self.viewport.scale);
                self.y = self.y + event.dy / (self.viewport.h * self.viewport.scale);

                self.redraw_pos();

            },
            onend: function (event) {
                self.save_layout();
            }
        })

    /** Allow element to be resized */
    interact(this.div)
        .resizable({
            edges: { left: true, top: true, right: true, bottom: true }
            })
        .on('resizestart', function (event) {
            self.menu.hide_any();
        })
        .on('resizemove', function(event) {
            var target = event.target;
            var newWidth = event.rect.width;
            var newHeight = event.rect.height;
            var dx = event.deltaRect.left ;
            var dy = event.deltaRect.top ;
            var dz = event.deltaRect.right;
            var da = event.deltaRect.bottom;

            self.x += (dx + dz) / 2 / (viewport.w * viewport.scale);
            self.y += (dy + da) / 2 / (viewport.h * viewport.scale);

            self.w = newWidth / (viewport.w * viewport.scale) / 2;
            self.h = newHeight / (viewport.h * viewport.scale) / 2;

            self.on_resize(newWidth, newHeight);
            self.redraw_size();
            self.redraw_pos();
        })
        .on('resizeend', function(event) {
            self.save_layout();
        });

    var ctrlKey = 17;
    $(document).bind('keydown', function(event) {
        if (event.keyCode == ctrlKey) {
            interact(self.div).resizable(false);
        }
    });
    $(document).bind('keyup', function(event) {
        if (event.keyCode == ctrlKey) {
            interact(self.div).resizable(true);
        }
    });


    /** Open a WebSocket to the server */
    this.uid = args.uid;
    if (this.uid != undefined) {
        this.ws = Nengo.create_websocket(this.uid);
        this.ws.onmessage = function(event) {self.on_message(event);}
    }

    /** flag whether there is a scheduled update that hasn't happened yet */
    this.pending_update = false;

    this.menu = new Nengo.Menu(self.parent);
    interact(this.div)
        .on('hold', function(event) { //change to 'tap' for right click
            if (event.button == 0) {
                if (self.menu.visible_any()) {
                    self.menu.hide_any();
                } else {
                    self.menu.show(event.clientX, event.clientY,
                                   self.generate_menu());
                }
                event.stopPropagation();
            }
        })
        .on('tap', function(event) { //get rid of menus when clicking off
            if (event.button == 0) {
                if (self.menu.visible_any()) {
                    self.menu.hide_any();
                }
            }
        });
    $(this.div).bind('contextmenu', function(event) {
            event.preventDefault();
            event.stopPropagation();
            if (self.menu.visible_any()) {
                self.menu.hide_any();
            } else {
                self.menu.show(event.clientX, event.clientY,
                               self.generate_menu());
        }
    });

    Nengo.Component.components.push(this);
};

Nengo.Component.components = [];
Nengo.Component.save_components = function() {
    for (var index in Nengo.Component.components) {
        Nengo.Component.components[index].save_layout();
    }
};

/**
 * Method to be called when Component is resized
 */
Nengo.Component.prototype.on_resize = function(width, height) {};

/**
 * Method to be called when Component received a WebSocket message
 */
Nengo.Component.prototype.on_message = function(event) {};


Nengo.Component.prototype.generate_menu = function() {
    var self = this;
    var items = [];
    if (this.label_visible) {
        items.push(['Hide label', function() {
            self.hide_label();
            self.save_layout();
        }]);
    } else {
        items.push(['Show label', function() {
            self.show_label();
            self.save_layout();
        }]);
    }
    items.push(['Remove', function() {self.remove();}]);
    return items;
};

Nengo.Component.prototype.remove = function(undo_flag, notify_server) {
    undo_flag = typeof undo_flag !== 'undefined' ? undo_flag : false;
    notify_server = typeof notify_server !== 'undefined' ? notify_server : true;

    if (notify_server) {
        if (undo_flag === true) {
            this.ws.send('remove_undo');
        } else {
            this.ws.send('remove');
        }
    }
    this.parent.removeChild(this.div);
    var index = Nengo.Component.components.indexOf(this);
    Nengo.Component.components.splice(index, 1);
}


/**
 * Schedule update() to be called in the near future.  If update() is already
 * scheduled, then do nothing.  This is meant to limit how fast update() is
 * called in the case that we are changing the data faster than whatever
 * processing is needed in update()
 */
Nengo.Component.prototype.schedule_update = function(event) {
    if (this.pending_update == false) {
        this.pending_update = true;
        var self = this;
        window.setTimeout(
            function() {
                self.pending_update = false;
                self.update()
            }, 10);
    }
}

/**
 * Do any visual updating that is needed due to changes in the underlying data
 */
Nengo.Component.prototype.update = function(event) {
}

Nengo.Component.prototype.hide_label = function(event) {
    if (this.label_visible) {
        this.label.style.display = 'none';
        this.label_visible = false;
    }
}

Nengo.Component.prototype.show_label = function(event) {
    if (!this.label_visible) {
        this.label.style.display = 'inline';
        this.label_visible = true;
    }
}


Nengo.Component.prototype.layout_info = function () {
    var info = {};
    info.x = this.x;
    info.y = this.y;
    info.width = this.w;
    info.height = this.h;
    info.label_visible = this.label_visible;
    return info;
}

Nengo.Component.prototype.save_layout = function () {
    var info = this.layout_info();
    this.ws.send('config:' + JSON.stringify(info));
}

Nengo.Component.prototype.update_layout = function (config) {
    this.w = config.width;
    this.h = config.height;
    this.x = config.x;
    this.y = config.y;

    this.redraw_size();
    this.redraw_pos();
    this.on_resize(this.get_screen_width(), this.get_screen_height());

    if (config.label_visible === true) {
        this.show_label();
    } else {
        this.hide_label();
    }
}


Nengo.Component.prototype.redraw_size = function () {
    this.width = this.viewport.w * this.w * this.viewport.scale * 2;
    this.height = this.viewport.h * this.h * this.viewport.scale * 2;
    this.div.style.width = this.width;
    this.div.style.height = this.height;
};

Nengo.Component.prototype.redraw_pos = function () {
    var x = (this.x + this.viewport.x - this.w) * this.viewport.w * this.viewport.scale;
    var y = (this.y + this.viewport.y - this.h) * this.viewport.h * this.viewport.scale;
    Nengo.set_transform(this.div, x, y);
};

Nengo.Component.prototype.get_screen_width = function () {
    return this.viewport.w * this.w * this.viewport.scale * 2
};
Nengo.Component.prototype.get_screen_height = function () {
    return this.viewport.h * this.h * this.viewport.scale * 2
};
