import { VNode, dom, h } from "maquette";

import "./debug.css";
// import { first, setTransform } from "./views";

function menu(id: string, label: string): VNode {
    let text = "Add " + label;
    if (label === "") {
        text = "Add"; // Remove the trailing space
    }
    return h("div.dropup#" + id, [
        h("button.btn.btn-default.btn-block.dropdown-toggle", {
            "data-toggle": "dropdown",
            "type": "button",
        }, [text, h("span.caret")]),
        h("ul.dropdown-menu"),
    ]);
}

function button(id: string, icon: string, {active: active = false} = {}) {
    let activeClass = "";
    if (active) {
        activeClass = ".active";
    }

    return h("button.btn.btn-default.btn-block" + activeClass + "#" + id, {
        "autocomplete": "off",
        "data-toggle": "button",
        "type": "button",
    }, [
        h("span.glyphicon.glyphicon-" + icon),
    ]);
}

export class DebugView {
    root: HTMLDivElement;
    debug: HTMLDivElement;
    log: HTMLButtonElement;
    outline: HTMLButtonElement;
    private controls: HTMLDivElement;
    private menus: {[id: string]: HTMLDivElement};

    constructor() {
        const node =
            h("div", [
                h("div.debug"),
                h("div.debug-controls", [
                    h("div.control-group", [
                        button("outline", "th"),
                        button("log", "info-sign", {active: true}),
                    ]),
                    h("div.control-group", [
                        menu("main", ""),
                        menu("view", "View"),
                    ]),
                ]),
            ]);
        this.root = dom.create(node).domNode as HTMLDivElement;
        this.debug = this.root.querySelector(".debug") as HTMLDivElement;
        this.controls =
            this.root.querySelector(".debug-controls") as HTMLDivElement;
        this.outline =
            this.controls.querySelector("#outline") as HTMLButtonElement;
        this.log = this.controls.querySelector("#log") as HTMLButtonElement;
        this.menus = {
            main: this.controls.querySelector("#main") as HTMLDivElement,
            view: this.controls.querySelector("#view") as HTMLDivElement,
        };
    }

    addControlGroup(label: string) {
        const controlGroupNode =
            h("div.control-group.last", [
                h("div", [
                    h("p", [h("code", ["obj = new " + label + "(...);"])]),
                    h("button.btn.btn-xs.btn-default.pull-right#remove", [
                        "Remove " + label,
                    ]),
                ]),
                h("div.input-group", [
                    h("input.form-control", {"type": "text"}),
                    h("span.input-group-btn", [
                        h("button.btn.btn-default#eval", {"type": "button"}, [
                            "Eval JS",
                        ]),
                    ]),
                ]),
                h("div", [
                    h("p", [
                        h("code", [h("span.glyphicon.glyphicon-console")]),
                    ]),
                    h("p", [h("code#output")]),
                ]),
            ]);
        const root = dom.create(controlGroupNode).domNode as HTMLDivElement;
        const input = root.querySelector("input");
        const evalBtn = root.querySelector("#eval") as HTMLButtonElement;
        const evalOutput = root.querySelector("#output") as HTMLElement;
        const remove = root.querySelector("#remove") as HTMLButtonElement;
        this.controls.appendChild(root);
        return {
            controlGroupRoot: root,
            evalBtn: evalBtn,
            evalOutput: evalOutput,
            input: input,
            remove: remove,
        };
    }

    removeControlGroup(root: HTMLDivElement) {
        this.controls.removeChild(root);
    }

    register(category: string, label: string) {
        const node = h("li", [h("a", {href: "#"}, [label])]);
        const root = dom.create(node).domNode;
        this.menus[category].querySelector(".dropdown-menu").appendChild(root);
        return root.querySelector("a") as HTMLAnchorElement;
    }

    redraw(): void {
        // nothing needed
    }
}
