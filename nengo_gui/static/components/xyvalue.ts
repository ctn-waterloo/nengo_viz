/**
 * Line graph showing decoded values over time.
 *
 * @constructor
 * @param {DOMElement} parent - the exylement to add this component to
 * @param {SimControl} sim - the simulation controller
 * @param {dict} args - A set of constructor arguments (see Component)
 * @param {int} args.n_lines - number of decoded values
 * @param {float} args.min_value - minimum value on x-axis and y-axis
 * @param {float} args.max_value - maximum value on x-axis and y-axis
 * @param {SimControl} args.sim - the simulation controller
 *
 * XYValue constructor is called by python server when a user requests a plot
 * or when the config file is making graphs. Server request is handled in
 * netgraph.js {.on_message} function.
 */

import * as d3 from "d3";
import * as $ from "jquery";

import { DataStore } from "../datastore";
import * as utils from "../utils";
import * as viewport from "../viewport";
import { Component } from "./component";
import { XYAxes } from "./xy-axes";
import "./xyvalue.css";

export class XYValue extends Component {
    axes2d;
    dataStore;
    indexX;
    indexY;
    invalidDims;
    nLines;
    path;
    recentCircle;
    sim;
    warningText;

    constructor(parent, sim, args) {
        super(parent, args);

        this.nLines = args.nLines || 1;
        this.sim = sim;

        // For storing the accumulated data
        this.dataStore = new DataStore(this.nLines, this.sim, 0);

        this.axes2d = new XYAxes(this.div, args);

        // The two indices of the multi-dimensional data to display
        this.indexX = args.indexX;
        this.indexY = args.indexY;

        // Call scheduleUpdate whenever the time is adjusted in the SimControl
        this.sim.timeSlider.div.addEventListener("adjustTime", e => {
            this.scheduleUpdate();
        });

        // Call reset whenever the simulation is reset
        this.sim.div.addEventListener("resetSim", e => {
            this.reset();
        });

        // Create the lines on the plots
        d3.svg.line()
            .x(function(d, i) {
                return this.axes2d
                    .scaleX(this.dataStore.data[this.indexX][i]);
            }).y(function(d) {
                return this.axes2d.scaleY(d);
            });
        this.path = this.axes2d.svg.append("g")
            .selectAll("path")
            .data([this.dataStore.data[this.indexY]]);
        this.path.enter().append("path")
            .attr("class", "line")
            .style("stroke", utils.makeColors(1));

        // Create a circle to track the most recent data
        this.recentCircle = this.axes2d.svg.append("circle")
            .attr("r", this.getCircleRadius())
            .attr("cx", this.axes2d.scaleX(0))
            .attr("cy", this.axes2d.scaleY(0))
            .style("fill", utils.makeColors(1)[0])
            .style("fill-opacity", 0);

        this.invalidDims = false;

        this.axes2d.fitTicks(this);
        this.onResize(
            viewport.scaleWidth(this.w), viewport.scaleHeight(this.h));
    }

    /**
     * Receive new line data from the server.
     */
    onMessage(event) {
        const data = new Float32Array(event.data);
        this.dataStore.push(data);
        this.scheduleUpdate();
    }

    /**
     * Redraw the lines and axis due to changed data.
     */
    update() {
        // Let the data store clear out old values
        this.dataStore.update();

        // Update the lines if there is data with valid dimensions
        if (this.indexX < this.nLines && this.indexY < this.nLines) {
            const shownData = this.dataStore.getShownData();

            // Update the lines
            const line = d3.svg.line()
                .x(function(d, i) {
                    return this.axes2d.scaleX(shownData[this.indexX][i]);
                }).y(function(d) {
                    return this.axes2d.scaleY(d);
                });
            this.path.data([shownData[this.indexY]])
                .attr("d", line);

            const lastIndex = shownData[this.indexX].length - 1;

            if (lastIndex >= 0) {
                // Update the circle if there is valid data
                this.recentCircle
                    .attr("cx", this.axes2d.scaleX(
                        shownData[this.indexX][lastIndex]))
                    .attr("cy", this.axes2d.scaleY(
                        shownData[this.indexY][lastIndex]))
                    .style("fill-opacity", 0.5);
            }

            // If switching from invalids dimensions to valid dimensions, remove
            // the label
            if (this.invalidDims === true) {
                this.div.removeChild(this.warningText);
                this.invalidDims = false;
            }

        } else if (this.invalidDims === false) {
            this.invalidDims = true;

            // Create the HTML text element
            this.warningText = document.createElement("div");
            this.div.appendChild(this.warningText);
            this.warningText.className = "warning-text";
            this.warningText.innerHTML = "Change<br>Dimension<br>Indices";
        }
    }

    /**
     * Adjust the graph layout due to changed size
     */
    onResize(width, height) {
        this.axes2d.onResize(width, height);

        this.update();

        this.label.style.width = width;
        this.width = width;
        this.height = height;
        this.div.style.width = width;
        this.div.style.height = height;
        this.recentCircle.attr("r", this.getCircleRadius());
    }

    getCircleRadius() {
        return Math.min(this.width, this.height) / 30;
    }

    generateMenu() {
        const items = [
            ["Set range...", function() {
                this.setRange();
            }],
            ["Set X, Y indices...", function() {
                this.setIndices();
            }],
        ];

        // Add the parent's menu items to this
        return $.merge(items, Component.prototype.generateMenu.call(this));
    }

    layoutInfo() {
        const info = Component.prototype.layoutInfo.call(this);
        info.minValue = this.axes2d.scaleY.domain()[0];
        info.maxValue = this.axes2d.scaleY.domain()[1];
        info.indexX = this.indexX;
        info.indexY = this.indexY;
        return info;
    }

    updateLayout(config) {
        this.updateIndices(config.indexX, config.indexY);
        this.updateRange(config.minValue, config.maxValue);
        Component.prototype.updateLayout.call(this, config);
    }

    setRange() {
        const range = this.axes2d.scaleY.domain();
        this.sim.modal.title("Set graph range...");
        this.sim.modal.singleInputBody(range, "New range");
        this.sim.modal.footer("okCancel", function(e) {
            let newRange = $("#singleInput").val();
            const modal = $("#myModalForm").data("bs.validator");

            modal.validate();
            if (modal.hasErrors() || modal.isIncomplete()) {
                return;
            }
            if (newRange !== null) {
                newRange = newRange.split(",");
                const min = parseFloat(newRange[0]);
                const max = parseFloat(newRange[1]);
                this.updateRange(min, max);
                this.update();
                this.saveLayout();
            }
            $("#OK").attr("data-dismiss", "modal");
        });
        $("#myModalForm").validator({
            custom: {
                myValidator: function($item) {
                    const nums = $item.val().split(",");
                    let valid = false;
                    if ($.isNumeric(nums[0]) && $.isNumeric(nums[1])) {
                        // Two numbers, 1st less than 2nd.
                        // The axes must intersect at 0.
                        const ordered = Number(nums[0]) < Number(nums[1]);
                        const zeroed = Number(nums[0]) * Number(nums[1]) <= 0;
                        if (ordered && zeroed) {
                            valid = true;
                        }
                    }
                    return (nums.length === 2 && valid);
                },
            },
        });

        $("#singleInput").attr(
            "data-error", "Input should be in the form " +
                "'<min>,<max>' and the axes must cross at zero.");
        this.sim.modal.show();
    }

    updateRange(min, max) {
        this.axes2d.minVal = min;
        this.axes2d.maxVal = max;
        this.axes2d.scaleX.domain([min, max]);
        this.axes2d.scaleY.domain([min, max]);
        this.axes2d.axisX.tickValues([min, max]);
        this.axes2d.axisY.tickValues([min, max]);
        this.axes2d.axisY_g.call(this.axes2d.axisY);
        this.axes2d.axisX_g.call(this.axes2d.axisX);
        this.onResize(
            viewport.scaleWidth(this.w), viewport.scaleHeight(this.h));
    }

    setIndices() {
        this.sim.modal.title("Set X and Y indices...");
        this.sim.modal.singleInputBody(
            [this.indexX, this.indexY], "New indices");
        this.sim.modal.footer("okCancel", function(e) {
            let newIndices = $("#singleInput").val();
            const modal = $("#myModalForm").data("bs.validator");

            modal.validate();
            if (modal.hasErrors() || modal.isIncomplete()) {
                return;
            }
            if (newIndices !== null) {
                newIndices = newIndices.split(",");
                this.updateIndices(parseInt(newIndices[0], 10),
                                    parseInt(newIndices[1], 10));
                this.saveLayout();
            }
            $("#OK").attr("data-dismiss", "modal");
        });
        $("#myModalForm").validator({
            custom: {
                myValidator: function($item) {
                    const nums = $item.val().split(",").map(Number);
                    return ((parseInt(nums[0], 10) === nums[0]) &&
                            (parseInt(nums[1], 10) === nums[1]) &&
                            (nums.length === 2) &&
                            (Number(nums[1]) < this.nLines &&
                             Number(nums[1]) >= 0) &&
                            (Number(nums[0]) < this.nLines &&
                             Number(nums[0]) >= 0));
                },
            },
        });

        $("#singleInput").attr(
            "data-error", "Input should be two positive " +
                "integers in the form '<dimension 1>,<dimension 2>'. " +
                "Dimensions are zero indexed.");

        this.sim.modal.show();
    }

    updateIndices(indexX, indexY) {
        this.indexX = indexX;
        this.indexY = indexY;
        this.update();
    }

    reset() {
        this.dataStore.reset();
        this.scheduleUpdate();
    }
}
