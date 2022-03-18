import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import Engine from "./src/Engine.js";
import axios from "axios";

const argv = yargs(hideBin(process.argv))
    .option('streams', {
        alias: "s",
        type: "number",
        describe: "Number of simultanious connections to one host",
        default: 50
    })
    .option('time', {
        alias: "t",
        type: "number",
        describe: "Work time",
        //default: 1000 * 60 * 60 * 24
        default: 0
    })
    .option('targetsRefresh', {
        alias: "r",
        type: "number",
        describe: "Targets refresh period",
        default: 1000 * 60 * 30
    })
    .option('targets', {
        alias: "g",
        type: "boolean",
        describe: "Use global targets",
        default: true
    })
    .option('customtargets', {
        alias: "c",
        type: "boolean",
        describe: "Use targets from file",
        default: true
    })
    .option('timeout', {
        alias: "o",
        type: "number",
        describe: "Request timout",
        default: 10000
    })
    .argv;

new Engine(argv);
