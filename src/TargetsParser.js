import axios from "axios";
import manualTargets from "../targets/targets.js";

export default class TargetsParser {
    static async getAllTargets () {
        let targets = await Promise.all([
            TargetsParser.getCustomTargets(),
            await TargetsParser.getSeparsTargets(),
            await TargetsParser.getMordorTargets()
        ].flat().filter(TargetsParser.onlyUnique))
        targets = targets.map(url => [`http://${url}`, `https://${url}:443`]).flat();

        return this.shuffle(targets);
    }

    static getCustomTargets () {
        return manualTargets.slice();
    }

    static async getSeparsTargets () {
        let targetsUrl = "https://stats.frontend.im/api/getMonitorlist/gV8xvSq5Bv";
        let targetPage = 1;
        let targets = [];
        let dateNow = Date.now();
        let danger = [];
        let available = true;

        while (available) {
            await new Promise((resolve, reject) => {
                const controller = new AbortController();
                axios({
                    url: `${targetsUrl}?page=${targetPage}&_=${dateNow}`,
                    responseType: "json",
                    signal: controller.signal,
                    timeout: TargetsParser.timeout
                })
                    .then((response, reject) => {
                        danger = [];
                        let success = [];
                        let body = response.data;
                        if (body) {
                            let json = body;
                            let monitors = json.psp.monitors;
                            success = monitors.filter(item => item.statusClass === "success").map(item => item.name);
                            danger = monitors.filter(item => item.statusClass === "danger").map(item => item.name);
                            targets = targets.concat(success);
                            available = !!success.length;
                        }
                    })
                    .catch((error) => {
                        targets = [];
                        console.warn("TargetsParser fail: 'https://stats.frontend.im' is not available now");
                        controller.abort();
                        available = false;
                        resolve();
                    })
                    .then(() => {
                        controller.abort();
                        resolve();
                    });
                targetPage++;
            });

            if (targetPage > 100) {
                console.warn("getSeparsTargets(): Loop overflow");
                break;
            }
        }

        if (targets.length) {
            console.log("TargetsParser: 'https://stats.frontend.im' parsed successfuly!");
        }

        global.gc();
        return targets;
    }

    static async getMordorTargets () {
        let targetsUrl = "https://api.mordor-sites-status.info/api/sites";
        let targets = [];

        return await new Promise((resolve, reject) => {
            const controller = new AbortController();
            axios({
                url: targetsUrl,
                responseType: "json",
                signal: controller.signal,
                timeout: TargetsParser.timeout
            })
                .then(response => {
                    let json = response.data;
                    if (json) {
                        targets = json.filter(item => item.status === "up").map(item => item.name);
                    }
                })
                .catch((error) => {
                    targets = [];
                    console.warn("\r\nTargetsParser fail: 'https://api.mordor-sites-status.info' is not available now");
                    controller.abort();
                    resolve(targets);
                })
                .then(() => {
                    controller.abort();
                    global.gc();
                    if (targets.length) {
                        console.log("\r\nTargetsParser: 'https://api.mordor-sites-status.info' parsed successfuly!");
                    }
                    resolve(targets);
                });
        })
    }

    static onlyUnique (value, index, self) {
        return self.indexOf(value) === index;
    }

    static shuffle(array) {
        let currentIndex = array.length,  randomIndex;

        // While there remain elements to shuffle...
        while (currentIndex != 0) {

            // Pick a remaining element...
            randomIndex = Math.floor(Math.random() * currentIndex);
            currentIndex--;

            // And swap it with the current element.
            [array[currentIndex], array[randomIndex]] = [
                array[randomIndex], array[currentIndex]];
        }

        return array;
    }

    static get timeout () {
        return 5000;
    }

    static onlyUnique (value, index, self) {
        return self.indexOf(value) === index;
    }
}