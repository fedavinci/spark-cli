"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const readline = __importStar(require("readline"));
const ws_1 = __importDefault(require("ws"));
const crypto_js_1 = __importDefault(require("crypto-js"));
const path_1 = __importDefault(require("path"));
const fs = __importStar(require("node:fs/promises"));
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});
const USER_HOME = process.env.HOME || process.env.USERPROFILE;
const DEFAULT_CLI_HOME = ".spark-ai";
commander_1.program
    .argument("[question]", "对星火大模型提出的问题")
    .action(async () => {
    process.stdout.write("提示：1 token 约等于1.5个中文汉字 或者 0.8个英文单词\n");
    checkUserHome();
    rl.setPrompt("spark-ai > ");
    rl.prompt();
    // 后续的问题处理
    rl.addListener("line", handlerQuestion);
    // 关闭事件
    rl.addListener("close", () => process.stdout.write("\n感谢您的使用\n"));
})
    .parse();
async function handlerQuestion(question) {
    if (question.length) {
        const res = await askAI(question);
        const { prompt_tokens, completion_tokens, total_tokens } = res.at(-1).payload.usage.text;
        process.stdout.write(`\n\n提问部分消耗token数量：${prompt_tokens}\n`);
        process.stdout.write(`回答部分消耗token数量：${completion_tokens}\n`);
        process.stdout.write(`本次回答总共消耗token数量：${total_tokens}\n`);
    }
    rl.prompt();
}
async function getSparkAIConfig() {
    if (!USER_HOME) {
        throw new Error("无法读取用户目录，无法读取用户配置文件.");
    }
    const configFilePath = path_1.default.join(USER_HOME, DEFAULT_CLI_HOME);
    try {
        await fs.access(configFilePath);
        try {
            JSON.parse(await fs.readFile(configFilePath).then((res) => res.toString()));
        }
        catch (e) {
            throw new Error("配置文件格式错误,请检查配置文件: " + configFilePath.toString());
        }
    }
    catch (e) {
        const APPID = await new Promise((resolve) => rl.question("请输入 APPID:", resolve));
        const APISecret = await new Promise((resolve) => rl.question("请输入 APISecret:", resolve));
        const APIKey = await new Promise((resolve) => rl.question("请输入 APIKey:", resolve));
        // 创建默认的配置文件
        await fs.writeFile(configFilePath, JSON.stringify({
            APPID: APPID,
            APISecret: APISecret,
            APIKey: APIKey,
        }, undefined, "\t"));
    }
    return fs.readFile(configFilePath).then((res) => JSON.parse(res.toString()));
}
function checkUserHome() {
    if (!USER_HOME) {
        throw new Error("当前登录用户主目录不存在，无法读取用户配置文件.");
    }
}
function askAI(question) {
    return new Promise(async (resolve, reject) => {
        const url = new URL("wss://spark-api.xf-yun.com/v1.1/chat");
        const { host, pathname } = url;
        const date = new Date().toUTCString();
        const sparkAIConfig = await getSparkAIConfig();
        const { APPID: appId, APISecret: apiSecret, APIKey: apiKey, } = sparkAIConfig;
        const signatureOrigin = `host: ${host}\ndate: ${date}\nGET ${pathname} HTTP/1.1`;
        const signatureSha = crypto_js_1.default.HmacSHA256(signatureOrigin, apiSecret);
        const signature = crypto_js_1.default.enc.Base64.stringify(signatureSha);
        const algorithm = "hmac-sha256";
        const headers = "host date request-line";
        const authorizationOrigin = `api_key="${apiKey}", algorithm="${algorithm}", headers="${headers}", signature="${signature}"`;
        const authorization = btoa(authorizationOrigin);
        const header = {
            header: {
                app_id: appId,
            },
            parameter: {
                chat: {
                    domain: "general",
                    temperature: 0.5,
                },
            },
            payload: {
                message: {
                    text: [{ role: "user", content: question }],
                },
            },
        };
        const websocket = new ws_1.default(`${url}?authorization=${authorization}&date=${date}&host=${host}`);
        // 1分钟后 关闭websocket连接
        const t = setTimeout(() => {
            reject(new Error("请求超时"));
            websocket && websocket.close();
        }, 60e3);
        const responseList = [];
        websocket.addListener("open", () => {
            websocket.send(JSON.stringify(header));
        });
        websocket.addListener("message", (data) => {
            const res = JSON.parse(data.toString());
            if (res.header.code !== 0) {
                process.stdout.write(res.header.message);
                process.exit(-1);
            }
            responseList.push(res);
            process.stdout.write(JSON.parse(data.toString())
                .payload.choices.text.map((text) => text.content)
                .join(""));
        });
        websocket.addListener("close", () => {
            clearTimeout(t); // 清除超时
            resolve(responseList);
        });
        websocket.addListener("error", reject);
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvaW5kZXgudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLHlDQUFvQztBQUNwQyxtREFBcUM7QUFDckMsNENBQTJCO0FBQzNCLDBEQUFpQztBQUNqQyxnREFBd0I7QUFDeEIscURBQXVDO0FBRXZDLE1BQU0sRUFBRSxHQUFHLFFBQVEsQ0FBQyxlQUFlLENBQUM7SUFDbEMsS0FBSyxFQUFFLE9BQU8sQ0FBQyxLQUFLO0lBQ3BCLE1BQU0sRUFBRSxPQUFPLENBQUMsTUFBTTtDQUN2QixDQUFDLENBQUM7QUFFSCxNQUFNLFNBQVMsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksSUFBSSxPQUFPLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQztBQUM5RCxNQUFNLGdCQUFnQixHQUFHLFdBQVcsQ0FBQztBQUVyQyxtQkFBTztLQUNKLFFBQVEsQ0FBQyxZQUFZLEVBQUUsYUFBYSxDQUFDO0tBQ3JDLE1BQU0sQ0FBQyxLQUFLLElBQUksRUFBRTtJQUNqQixPQUFPLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FDbEIsc0NBQXNDLENBQ3ZDLENBQUM7SUFFRixhQUFhLEVBQUUsQ0FBQztJQUVoQixFQUFFLENBQUMsU0FBUyxDQUFDLGFBQWEsQ0FBQyxDQUFDO0lBQzVCLEVBQUUsQ0FBQyxNQUFNLEVBQUUsQ0FBQztJQUNaLFVBQVU7SUFDVixFQUFFLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxlQUFlLENBQUMsQ0FBQztJQUN4QyxPQUFPO0lBQ1AsRUFBRSxDQUFDLFdBQVcsQ0FBQyxPQUFPLEVBQUUsR0FBRyxFQUFFLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQztBQUNwRSxDQUFDLENBQUM7S0FDRCxLQUFLLEVBQUUsQ0FBQztBQWdDWCxLQUFLLFVBQVUsZUFBZSxDQUFDLFFBQVE7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