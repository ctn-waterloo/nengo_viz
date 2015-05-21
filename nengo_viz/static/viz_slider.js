/**
 * A slider to adjust Node values
 * @constructor
 *
 * @params {dict} args - a set of constructor arguments (see VIZ.Component)
 * @params {int} args.n_sliders - the number of sliders to show
 */
VIZ.Slider = function(parent, args) {
    VIZ.Component.call(this, parent, args);
    var self = this;

    //Check if user is filling in a number into a slider
    this.filling_slider_value = false;

    this.notify_msgs = [];

    VIZ.set_transform(this.label, 0, -30);
 
    /** a scale to map from values to pixels */
    this.scale = d3.scale.linear();
    this.scale.domain([args.max_value,  args.min_value]);
    this.scale.range([0, args.height]);
    
    /** number of pixels high for the slider itself */
    this.slider_height = 30;
    this.minHeight = 40;
    
    /** make the sliders */
    this.sliders = [];
    for (var i = 0; i < args.n_sliders; i++) {
        var slider = {};
        this.sliders.push(slider);
        
        slider.index = i;
        slider.div = document.createElement('button');
        slider.div.className = 'btn btn-default';
        slider.div.style.padding = '5px 0px';
        slider.div.style.borderColor = '#666';
        
        slider.value = args.start_value[i];

        /** Show the slider Value */
        var valueDisplay = document.createElement('div');
        valueDisplay.classList.add('value_display');
        valueDisplay.innerHTML = slider.value;
        slider.div.appendChild(valueDisplay);
        slider.value_display = valueDisplay;
        this.update_value_text(i, slider.value);

        /** put the slider in the container */
        slider.div.style.position = 'fixed';
        this.div.appendChild(slider.div);
        slider.div.style.zIndex = 1;
        slider.div.slider = slider;

        /** Slider jumps to zero when middle clicked */
        /** TODO: Replicate this functionality for touch */
        slider.div.addEventListener("click", 
            function(event) {
                /** check if click was the middle mouse button */
                if (event.which == 2){
                    self.set_value(this.slider.index, 0, true);
                }
            }
        );

        interact(slider.div)
            .on('tap', function(event) {
                var ind = event.currentTarget.slider.index;
                self.input_set_value(ind);
                event.stopPropagation();
                 })


        /** setup slider dragging */
        interact(slider.div)
            .draggable({
                onstart: function () {
                    self.menu.hide_any();
                    self.disable_all_slider_inputs();
                },
                onmove: function (event) {
                    var target = event.target;

                    /** load x and y from custom data-x/y attributes */ 
                    var x = parseFloat(target.getAttribute('fixed-x'));
                    var y = parseFloat(target.getAttribute('drag-y')) +
                                                                     event.dy;

                    /** store the actual drag location without bounds */
                    target.setAttribute('drag-y', y);
                    /** bound y to within the limits */
                    if (y > self.scale.range()[1]) {
                        y = self.scale.range()[1];
                    }
                    if (y < self.scale.range()[0]) {
                        y = self.scale.range()[0];
                    }

                    VIZ.set_transform(target, x, y - self.slider_height / 2);
                      
                    /** update the value and send it to the server */
                    var old_value = target.slider.value;
                    
                    var new_value = self.scale.invert(y);

                    if (new_value != old_value) {
                        self.set_value(target.slider.index, new_value, true);
                    }
                },
                onend: function(event){
                    var target = event.target;

                    var y = parseFloat(target.getAttribute('drag-y'));

                    /** important to keep these conditions seperate from above, otherwise
                    *   sliders will get out of synch
                    */
                    if (y > self.scale.range()[1]) {
                        target.setAttribute('drag-y', self.scale.range()[1]);
                    }
                    if (y < self.scale.range()[0]) {
                        target.setAttribute('drag-y', self.scale.range()[0]);
                    }
                }
            });
    }

    this.guideline_width = 7;
    for (var i = 0; i<args.n_sliders;i++){
        /** show the guideline */
        var guideline = document.createElement('div');
        this.sliders[i].guideline = guideline;
        guideline.classList.add('guideline');
        guideline.style.position = "fixed";
        //subtract 2 from height for border
        guideline.style.height = args.height - 2;
        guideline.style.width = this.guideline_width;
        //Good for positioning regardless of # of sliders
        var guide_x = args.width / (2 * args.n_sliders) + 
            (args.width / args.n_sliders) * i - this.guideline_width / 2;
        VIZ.set_transform(guideline, guide_x, 0);
        this.div.appendChild(guideline);
    }

    this.on_resize(this.get_screen_width(), this.get_screen_height()); 
};


VIZ.Slider.prototype = Object.create(VIZ.Component.prototype);
VIZ.Slider.prototype.constructor = VIZ.Slider;

VIZ.Slider.prototype.set_value = function(slider_index, value, immediate) {
    console.assert(typeof slider_index == 'number');
    console.assert(typeof value == 'number');
    console.assert(typeof immediate == 'boolean');

    //Make sure the new value is in the slider range.
    value = this.max_min(value);

    //Get the slider
    var target = this.sliders[slider_index].div;

    //important for 2d sliders
    var x_pos = target.getAttribute('fixed-x'); 
    
    //Get the scaled value
    var point = this.scale(value);

    //Get the slider height
    var height = this.slider_height;

    //Change shown text value to new value
    this.update_value_text(slider_index, value)

    //Change slider's value to value
    target.slider.value = value;

    //Set sliders attributed position to the middle
    target.setAttribute('drag-y', point);

    //Move the slider to the middle, subtract half slider height due to pixel offset
    VIZ.set_transform(target, x_pos, point - height / 2);

    //Send update to the server
    if (immediate) {
        this.ws.send(slider_index + ',' + value);
    }
    else{
        this.notify(slider_index + ',' + value);
    }

    //Value has been set, toggle boolean to false
    this.filling_slider_value = false;
};

/**
 * update visual display based when component is resized
 */
VIZ.Slider.prototype.on_resize = function(width, height) {
    console.assert(typeof width == 'number');
    console.assert(typeof height == 'number');

    if (width < this.minWidth) {
        width = this.minWidth;
    }
    if (height < this.minHeight) {
        height = this.minHeight;
    };
    var N = this.sliders.length;
    this.scale.range([0, height]);
    for (var i in this.sliders) {
        var slider = this.sliders[i];
        /** figure out the size of the slider */
        slider.div.style.width = width / N - 3;
        slider.div.style.height = this.slider_height;

        //subtract 2 from height for border
        slider.guideline.style.height = height - 2;

        var guide_x = width / (2 * N) + (width / N) * i 
            - this.guideline_width / 2;

        VIZ.set_transform(slider.guideline, guide_x, 0);

        /** figure out the position of the slider */   
        var x = i * width / N;
        var y = this.scale(slider.value);
        VIZ.set_transform(slider.div, x, y - this.slider_height / 2);

        /** store the x and y locations for use in dragging */
        slider.div.setAttribute('fixed-x', x);
        slider.div.setAttribute('drag-y', y);
    }
    this.label.style.width = width;
    this.width = width;
    this.height = height;
    this.div.style.width = width;
    this.div.style.height= height;    
    
};


VIZ.Slider.prototype.generate_menu = function() {
    var self = this;
    var items = [];
    items.push(['Set range', function() {self.set_range();}]);
    items.push(['Set value', function() {self.user_value();}]);

    // add the parent's menu items to this
    // TODO: is this really the best way to call the parent's generate_menu()?
    return $.merge(items, VIZ.Component.prototype.generate_menu.call(this));
};

VIZ.Slider.prototype.input_set_value = function(ind) {
    console.assert(typeof ind == 'number');

    var self = this;
    this.disable_all_slider_inputs();
    this.menu.hide_any();
    var text_div = this.sliders[ind].value_display;
    var original_value = text_div.innerHTML;
    this.filling_slider_value = true;
    this.filling_slider_index = ind;
    this.filling_slider_original_value = original_value;
    text_div.innerHTML = '<input id="value_in_field" style=" border:0; outline:0;"></input>';
    elem = text_div.querySelector('#value_in_field')
    elem.value = original_value;
    elem.focus();
    elem.select();
    elem.style.width = '3em';
    elem.style.textAlign = 'center';
    $(text_div).on('keypress', function (event) {self.submit_value(event.which, ind, text_div, original_value);});
};

VIZ.Slider.prototype.disable_all_slider_inputs = function () {
    component_list = VIZ.Component.components
    slider_list = []

    //Build the slider list
    for (var i = 0; i < component_list.length; ++i) {
        var current = component_list[i];
        if (current instanceof VIZ.Slider){
            slider_list.push(current);
        }
    }

    //Disable editting on sliders
    for (var j = 0; j < slider_list.length; ++j) {
        current = slider_list[j];
        if (current.filling_slider_value) {
            var text_div = current.sliders[current.filling_slider_index].value_display;
            text_div.innerHTML = current.filling_slider_original_value;
            current.filling_slider_value = false;
        }
    }
}

VIZ.Slider.prototype.submit_value = function (button, ind, text_div, original_value) {
    console.assert(typeof button == 'number');
    console.assert(typeof ind == 'number');
    console.assert(typeof text_div == 'object');
    console.assert(typeof original_value == 'string');

    if (button == 13) {
        var msg = text_div.querySelector('#value_in_field').value;
        $(text_div).off('keypress');
        if (VIZ.is_num(msg)) {
            this.set_value(ind, Number(msg), true);
            return;
        }
        else {
            alert('failed to set value');
            text_div.innerHTML = original_value;
            return;
        }
    }
};

/** report an event back to the server */
VIZ.Slider.prototype.notify = function(info) {
    this.notify_msgs.push(info);
    
    // only send one message at a time
    // TODO: find a better way to figure out when it's safe to send
    // another message, rather than just waiting 1ms....
    if (this.notify_msgs.length == 1) {
        var self = this;
        window.setTimeout(function() {
            self.send_notify_msg();
        }, 50);
    }
}

/** send exactly one message back to server
 *  and schedule the next message to be sent, if any
 */
VIZ.Slider.prototype.send_notify_msg = function() {
    msg = this.notify_msgs[0];
    this.ws.send(msg);
    if (this.notify_msgs.length > 1) {
        var self = this;
        window.setTimeout(function() {
            self.send_notify_msg();
        }, 50);
    }
    this.notify_msgs.splice(0, 1);
}

VIZ.Slider.prototype.user_value = function () {

    //First build the prompt string
    var prompt_string = 'Example: ';
    for (var i = 0; i < this.sliders.length; i++){
        var rand = (Math.random() * 10).toFixed(1);
        prompt_string = prompt_string + rand;
        if (i != this.sliders.length - 1) {
            prompt_string = prompt_string + ", ";
        }
    }
    var new_value = prompt('Set value\n' + prompt_string);
    
    //If the user hits cancel
    if (new_value == null) {
        return;
    };

    //Make the string into a list
    new_value = new_value.split(',');

    //Update the sliders one at a time, checking input as we go
    for (var i = 0; i < this.sliders.length; i++){
        if (!(VIZ.is_num(new_value[i]))) {
            alert("invalid input :" + new_value[i] + "\nFor the slider in position " + (i + 1) );
            break;
        }
        this.set_value(i, Number(new_value[i]), false);
    }
};

VIZ.Slider.prototype.set_range = function() {
    var range = this.scale.domain();
    var new_range = prompt('Set range', '' + range[1] + ',' + range[0]);
    if (new_range !== null) {
        new_range = new_range.split(',');
        var min = parseFloat(new_range[1]);
        var max = parseFloat(new_range[0]);
        this.scale.domain([min, max]);
        this.save_layout();
    }
    for (var i in this.sliders) {
        this.set_value(i, this.sliders[i].value, false); 
    }
};

VIZ.Slider.prototype.layout_info = function () {
    var info = VIZ.Component.prototype.layout_info.call(this);
    info.min_value = this.scale.domain()[1];
    info.max_value = this.scale.domain()[0];
    return info;
};

//takes input and outputs the
//boundary value if input is above/below max/min
//Otherwise outputs the input
//max_min: Num -> Num
VIZ.Slider.prototype.max_min = function(value) {
    console.assert(typeof value == 'number');

    //Get the max and min slider bounds
    var slider_range = this.scale.domain();
    min = slider_range[1];
    max = slider_range[0];

    if (value < min) {
        return min;
    }
    else if (value > max) {
        return max;
    }
    else {
        return value;
    }
};

//slider_index: Nat, new_shown_value: Num
//Rounds to 2 decimal places
VIZ.Slider.prototype.update_value_text = function (slider_index, new_shown_value) {
    var target = this.sliders[slider_index].value_display;
    target.innerHTML = new_shown_value.toFixed(2);
};
