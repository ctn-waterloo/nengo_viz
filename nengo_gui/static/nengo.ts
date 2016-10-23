/**
 * Entry point into the Nengo application.
 */

import "bootstrap/dist/css/bootstrap.min.css";
import "imports?$=jquery,jQuery=jquery!bootstrap";
import "imports?$=jquery,jQuery=jquery!bootstrap-validator";
import "imports?$=jquery,jQuery=jquery!jquery-ui";
import "imports?$=jquery,jQuery=jquery!jqueryfiletree/src/jQueryFileTree";
import "jqueryfiletree/dist/jQueryFileTree.min.css";

import "./favicon.ico";
import "./nengo.css";

import { Editor } from "./editor";
import { NetGraph } from "./netgraph/netgraph";
import { SideMenu } from "./side-menu";
import { SimControl } from "./sim-control";
import { Toolbar } from "./toolbar";
import { WSConnection } from "./websocket";

// TODO: put all of this in an ajax call to Python. To get:
// editor uid (uid)
// netgraph uid
// simcontrol config/args (simconfig) -- shown_time, uid, kept_time
// filename

export class Nengo {
    control;
    editor;
    filename: string;
    hotkeys;
    main;
    modal;
    netgraph;
    sidemenu;
    sim;
    toolbar;
    private ws: WSConnection;

    constructor(simargs, filename, editoruid, netgraphargs) {
        this.filename = filename;

        this.main = document.getElementById("main");
        this.control = document.getElementById("control");
        this.ws = new WSConnection("main");

        this.netgraph = new NetGraph("uid");
        this.editor = new Editor(editoruid, this.netgraph);
        this.sim = new SimControl("uid", 4.0, 0.5);
        this.sim.attach(this.ws);
        this.sidemenu = new SideMenu(this.sim);
        this.toolbar = new Toolbar(filename, this.sim);

        this.modal = this.sim.modal;
        this.hotkeys = this.modal.hotkeys;

    }

    ondomload() {
        document.title = this.filename;

        document.body.appendChild(this.sim.view.root);

        // In case anything needs to be adjusted
        window.dispatchEvent(new Event("resize"));

        // body = document.getElementById("body");
        // body.removeChild(document.getElementById("loading-div"));
        // %(main_components)s
        // nengo = new Nengo.default(simargs, filename, editoruid, netgraphargs);
        // %(components)s
    }
}


// Most initialization can be done before DOM content is loaded
const nengo = new Nengo(null, null, null, null);
document.addEventListener("DOMContentLoaded", () => {
    nengo.ondomload();
});

// Exposing components for server
import "expose?HTMLView!./components/htmlview";
import "expose?Image!./components/image";
import "expose?Pointer!./components/pointer";
import "expose?Raster!./components/raster";
import "expose?Slider!./components/slider";
import "expose?SpaSimilarity!./components/spa_similarity";
import "expose?Value!./components/value";
import "expose?XYValue!./components/xyvalue";
import "expose?utils!./utils";
