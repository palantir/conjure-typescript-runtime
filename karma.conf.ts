import { ChildProcess, spawn } from "child_process";

const testCasesPath = "build/resources/test-cases.json";

module.exports = config => {
    let server: ChildProcess;
    config.beforeAll(() => {
        server = spawn("build/downloads/bin/verification-server", [testCasesPath]);
        server.stdout.setEncoding("utf8");
        return new Promise<void>(resolve => {
            server.stdout.on("data", (data: string) => {
                const lines = data.split(/(\r?\n)/g);
                for (const line in lines) {
                    if (line.startsWith("Listening ")) {
                        resolve();
                    }
                }
                console.log(lines.join("\n"));
            });
        });
    });
    config.afterAll(() => {
        server.kill();
    });
    config.set({
        frameworks: ["mocha", "chai", "karma-typescript"],
        files: [
            "src/**/*.ts",
        ],
        exclude: [
            "**/__tests__/*.ts",
        ],
        preprocessors: {
            "src/**/*.ts": "karma-typescript",
        },
        karmaTypescriptConfig: {
            tsconfig: "src/tsconfig.karma.json",
        },
        reporters: ["progress", "karma-typescript"],
        port: 9876,  // karma web server port
        colors: true,
        logLevel: config.LOG_INFO,
        browsers: ["ChromeHeadless"],
        autoWatch: false,
        // singleRun: false, // Karma captures browsers, runs the tests and exits
        concurrency: Infinity,
        coverage: false,
    })
};
