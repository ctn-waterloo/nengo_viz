/**
 * A slider to adjust Node values
 * @constructor
 *
 * @params {dict} args - a set of constructor arguments (see VIZ.Component)
 * @params {int} args.n_sliders - the number of sliders to show
 */
VIZ.Slider = function(args) {
    VIZ.Component.call(this, args);
    var self = this;

    VIZ.set_transform(this.label, 0, -20);
 
    /** a scale to map from values to pixels */
    this.scale = d3.scale.linear();
    this.scale.domain([args.max_value,  args.min_value]);
    this.scale.range([0, args.height]);
    
    /** number of pixels high for the slider itself */
    this.slider_height = 20;
    
    /** make the sliders */
    this.sliders = [];
    for (var i = 0; i < args.n_sliders; i++) {
        var slider = {};
        this.sliders.push(slider);
        
        slider.index = i;
        slider.div = document.createElement('div');
        slider.value = args.start_value[i];

        /** Show the slider Value */
        var valueDisplay = document.createElement('p');
        valueDisplay.innerHTML = slider.value;
        slider.div.appendChild(valueDisplay);

        /** put the slider in the container */
        slider.div.style.position = 'fixed';
        slider.div.classList.add('slider');
        this.div.appendChild(slider.div);
        slider.div.style.zIndex = 1;
        slider.div.slider = slider;

        /** Slider jumps to zero when middle clicked */
        /** TODO: Replicate this functionality for touch */
        slider.div.addEventListener("click", 
            function(event) {
                /** check if click was the middle mouse button */
                if (event.which == 2){
                    self.set_value(this.slider.index, 0);
                }
            }
        );

        /** setup slider dragging */
        interact(slider.div)
            .draggable({
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

                    /** only show slider value to 2 decimal places */
                    target.firstChild.innerHTML = new_value.toFixed(2); 

                    if (new_value != old_value) {
                        target.slider.value = new_value;
                        self.ws.send(target.slider.index + ',' + new_value);
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

    for (var i = 0; i<args.n_sliders;i++){
        /** show the guideline */
        this.guideline_width = 5;
        var guideline = document.createElement('div');
        this.sliders[i].guideline = guideline;
        guideline.classList.add('guideline');
        guideline.style.position = "fixed";
        //subtract 2 from height for border
        this.guideline_height = args.height - 2;
        guideline.style.height = this.guideline_height
        guideline.style.width = this.guideline_width;
        //Good for positioning regardless of # of sliders
        var guide_x = args.width / (2 * args.n_sliders) + 
            (args.width / args.n_sliders) * i - this.guideline_width / 2;
        VIZ.set_transform(guideline, guide_x, 0);
        this.div.appendChild(guideline);

        /** show the green zero-out button */
        var button_index = i;
        var button = document.createElement('div');
        this.sliders[i].button = button;
        button.style.height = this.guideline_width;
        button.style.width = this.guideline_width;
        button.classList.add('zero_button');
        guideline.appendChild(button);
        var y_pos = args.height / 2 - this.guideline_width / 2;
        VIZ.set_transform(button, 0, y_pos);
        button.addEventListener('click', function(){self.set_value(button_index, 0)});

        }

    this.on_resize(args.width, args.height);
};


VIZ.Slider.prototype = Object.create(VIZ.Component.prototype);
VIZ.Slider.prototype.constructor = VIZ.Slider;

VIZ.Slider.prototype.set_value = function(slider_index, value) {
    //Get the slider
    var target = this.sliders[slider_index].div;

    //important for 2d sliders
    var x_pos = target.getAttribute('fixed-x'); 
    
    //Get the scaled value
    var point = this.scale(value);

    //Get the slider height
    var height = this.slider_height;

    //Change shown text value to new value
    target.firstChild.textContent = value;

    //Change slider's value to value
    target.slider.value = value;

    //Set sliders attributed position to the middle
    target.setAttribute('drag-y', point);

    //Move the slider to the middle, subtract half slider height due to pixel offset
    VIZ.set_transform(target, x_pos, point - height / 2);

    //Send update to the server
    this.ws.send(slider_index + ',' + value);
};

/**
 * update visual display based when component is resized
 */
VIZ.Slider.prototype.on_resize = function(width, height) {
    var N = this.sliders.length;
    this.scale.range([0, height]);
    for (var i in this.sliders) {
        var slider = this.sliders[i];
        /** figure out the size of the slider */
        slider.div.style.width = width / N;
        slider.div.style.height = this.slider_height;

        //subtract 2 from height for border
        slider.guideline.style.height = height - 2;

        VIZ.set_transform(slider.button, 0, height / 2);

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
    
};