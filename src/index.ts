import { program } from "commander";
import * as readline from "readline";
import WebSocket from "ws";
import CryptoJS from "crypto-js";
import path from "path";
import * as fs from "node:fs/promises";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const USER_HOME = process.env.HOME || process.env.USERPROFILE;
const DEFAULT_CLI_HOME = ".spark-ai";

program
  .argument("[question]", "对星火大模型提出的问题")
  .action(async () => {
    await getSparkAIConfig();

    process.stdout.write(
      "\n提示：1 token 约等于1.5个中文汉字 或者 0.8个英文单词\n\n"
    );

    checkUserHome();

    rl.setPrompt("spark-ai > ");
    rl.prompt();
    // 后续的问题处理
    rl.addListener("line", handlerQuestion);
    // 关闭事件
    rl.addListener("close", () => process.stdout.write("\n感谢您的使用\n"));
  })
  .parse();

type AIResponse = {
  header: {
    code: 0 | number; // 错误码，0表示正常，非0表示出错；详细释义可在接口说明文档最后的错误码说明了解
    message: string; // 会话是否成功的描述信息
    sid: string; // 会话的唯一id，用于讯飞技术人员查询服务端会话日志使用,出现调用错误时建议留存该字段
    status: number; // 会话状态，取值为[0,1,2]；0代表首次结果；1代表中间结果；2代表最后一个结果
  };
  payload: {
    choices: {
      status: string; // 文本响应状态，取值为[0,1,2]; 0代表首个文本结果；1代表中间文本结果；2代表最后一个文本结果
      seq: number; // 返回的数据序号，取值为[0,9999999]
      text: [
        {
          content: string; // AI的回答内容
          role: "user" | "assistant"; // 角色标识，固定为assistant，标识角色为AI
          index: number; // 	结果序号，取值为[0,10]; 当前为保留字段，开发者可忽略
        }
      ];
    };
    usage?: {
      text: {
        question_tokens: number; //	保留字段，可忽略
        prompt_tokens: number; // 包含历史问题的总tokens大小
        completion_tokens: number; // 回答的tokens大小
        total_tokens: number; // prompt_tokens和completion_tokens的和，也是本次交互计费的tokens大小
      };
    };
  };
};

async function handlerQuestion(question) {
  if (question.length) {
    const res = await askAI(question);

    const { prompt_tokens, completion_tokens, total_tokens } =
      res.at(-1).payload.usage.text;

    process.stdout.write(`\n\n提问部分消耗token数量：${prompt_tokens}\n`);
    process.stdout.write(`回答部分消耗token数量：${completion_tokens}\n`);
    process.stdout.write(`本次回答总共消耗token数量：${total_tokens}\n\n`);
  }

  rl.prompt();
}

async function getSparkAIConfig() {
  if (!USER_HOME) {
    throw new Error("无法读取用户目录，无法读取用户配置文件.");
  }

  const configFilePath = path.join(USER_HOME, DEFAULT_CLI_HOME);

  try {
    await fs.access(configFilePath);

    try {
      JSON.parse(
        await fs.readFile(configFilePath).then((res) => res.toString())
      );
    } catch (e) {
      throw new Error(
        "配置文件格式错误,请检查配置文件: " + configFilePath.toString()
      );
    }
  } catch (e) {
    const APPID = await new Promise((resolve) =>
      rl.question("请输入 APPID:", resolve)
    );
    const APISecret = await new Promise((resolve) =>
      rl.question("请输入 APISecret:", resolve)
    );
    const APIKey = await new Promise((resolve) =>
      rl.question("请输入 APIKey:", resolve)
    );

    // 创建默认的配置文件
    await fs.writeFile(
      configFilePath,
      JSON.stringify(
        {
          APPID: APPID,
          APISecret: APISecret,
          APIKey: APIKey,
        },
        undefined,
        "\t"
      )
    );
  }

  return fs.readFile(configFilePath).then((res) => JSON.parse(res.toString()));
}

function checkUserHome() {
  if (!USER_HOME) {
    throw new Error("当前登录用户主目录不存在，无法读取用户配置文件.");
  }
}

function askAI(question): Promise<AIResponse[]> {
  return new Promise(async (resolve, reject) => {
    const url = new URL("wss://spark-api.xf-yun.com/v1.1/chat");

    const { host, pathname } = url;
    const date = new Date().toUTCString();

    const sparkAIConfig = await getSparkAIConfig();

    const {
      APPID: appId,
      APISecret: apiSecret,
      APIKey: apiKey,
    } = sparkAIConfig;

    const signatureOrigin = `host: ${host}\ndate: ${date}\nGET ${pathname} HTTP/1.1`;
    const signatureSha = CryptoJS.HmacSHA256(signatureOrigin, apiSecret);
    const signature = CryptoJS.enc.Base64.stringify(signatureSha);

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

    const websocket = new WebSocket(
      `${url}?authorization=${authorization}&date=${date}&host=${host}`
    );

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
      process.stdout.write(
        JSON.parse(data.toString())
          .payload.choices.text.map((text) => text.content.replace(/\n/g, ""))
          .join("")
      );
    });

    websocket.addListener("close", () => {
      clearTimeout(t); // 清除超时
      resolve(responseList);
    });

    websocket.addListener("error", reject);
  });
}
