import axios from "axios";

export default class TargetsParser {
    static async getAllTargets () {
        let targets = await Promise.all([
            await TargetsParser.getSeparsTargets(),
            await TargetsParser.getMordorTargets()
        ].flat());

        return this.shuffle(targets);
    }
    static async getSeparsTargets () {
        let targetsUrl = "https://stats.frontend.im/api/getMonitorlist/gV8xvSq5Bv";
        let targetPage = 1;
        let targets = [];
        let dateNow = Date.now();
        let danger = [];
        let available = true;

        while (available) {
            await new Promise(resolve => {
                const controller = new AbortController();
                axios({
                    url: `${targetsUrl}?page=${targetPage}&_=${dateNow}`,
                    responseType: "json",
                    signal: controller.signal
                })
                    .then(response => {
                        danger = [];
                        let success = [];
                        let body = response.data;
                        if (body) {
                            let json = body;
                            let monitors = json.psp.monitors;
                            success = monitors.filter(item => item.statusClass === "success").map(item => [`http://${item.name}`, `https://${item.name}:443`]).flat();
                            danger = monitors.filter(item => item.statusClass === "danger").map(item => item.name);
                            targets = targets.concat(success);
                            available = !!success.length;
                        }
                        resolve();
                    })
                    .catch((error) => {
                        reject();
                    })
                    .then(() => {
                        controller.abort();
                    });
                targetPage++;
            });

            if (targetPage > 100) {
                console.warn("getSeparsTargets(): Loop overflow");
                break;
            }
        }
        return targets;
    }

    static async getMordorTargets () {
        let targetsUrl = "https://api.mordor-sites-status.info/api/sites";
        let targets = [];

        return await new Promise(resolve => {
            const controller = new AbortController();
            axios({
                url: targetsUrl,
                responseType: "json",
                signal: controller.signal
            })
                .then(response => {
                    let json = response.data;
                    if (json) {
                        targets = json.filter(item => item.status === "up").map(item => [`https://${item.name}:443`, `http://${item.name}`]).flat();
                    }
                    resolve(targets);
                })
                .catch((error) => {
                    reject();
                })
                .then(() => {
                    controller.abort();
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
}