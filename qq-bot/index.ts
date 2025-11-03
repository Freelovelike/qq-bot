import "dotenv/config";
import * as os from "node:os";
import {
  NCWebsocket,
  type NCWebsocketOptions,
  Structs,
  type WSSendParam,
} from "node-napcat-ts";

const WsConfig: NCWebsocketOptions = {
  protocol: "wss",
  host: "napcat.freelike.cn",
  port: 443,
  accessToken: process.env.NC_ACCESS_TOKEN, // 请填写你的access_token
  throwPromise: false,
  reconnection: {
    enable: true,
    attempts: 10,
    delay: 5000,
  },
};
const bot = new NCWebsocket(WsConfig, true);

bot.on("socket.connecting", (res) => {
  console.log(`连接中#${res.reconnection.nowAttempts}`);
});

bot.on("socket.error", (err) => {
  console.log(`连接失败#${err.reconnection.nowAttempts}`);
  console.dir(err, { depth: null });
});

bot.on("socket.close", (err) => {
  console.log(`连接断开#${err.reconnection.nowAttempts}`);
  console.dir(err, { depth: null });
});

bot.on("socket.open", async (res) => {
  console.log(`连接成功#${res.reconnection.nowAttempts}`);
});

bot.on("api.preSend", (params) => {
  console.log("\n发送了一条请求");
  console.dir(params, { depth: null });
});

bot.on("message", async (context) => {
  console.log("\n机器人收到了一条信息\n");
  console.dir(context, { depth: null });

  for (const item of context.message) {
    if (item.type !== "text") continue;

    const text = item.data.text.trim(); // 统一去首尾空格

    /* ======== 基础指令 ======== */
    if (text === "echo") {
      await bot.send_msg({
        ...context,
        message: [Structs.text("hi 我是小皮")],
      });
      continue;
    }

    if (text === "/h") {
      await bot.send_msg({
        ...context,
        message: [Structs.text("这是帮助信息。")],
      });
      continue;
    }

    if (text === "/m") {
      await bot.send_msg({
        ...context,
        message: [Structs.text("这是菜单信息。")],
      });
      continue;
    }

    if (text === "/s") {
      await bot.send_msg({
        ...context,
        message: [Structs.text("这是设置信息。")],
      });
      continue;
    }

    if (text === "/os") {
      const uptime = os.uptime();
      const freeMemory = os.freemem();
      const totalMemory = os.totalmem();
      const cpuCount = os.cpus().length;
      const systemStatus =
        `系统运行时间: ${uptime} 秒\n` +
        `空闲内存: ${(freeMemory / (1024 * 1024)).toFixed(2)} MB\n` +
        `总内存: ${(totalMemory / (1024 * 1024)).toFixed(2)} MB\n` +
        `CPU 核心数: ${cpuCount}`;
      await bot.send_msg({
        ...context,
        message: [Structs.text(systemStatus)],
      });
      continue;
    }

    if (text === "233") {
      await bot.send_msg({ ...context, message: [Structs.face(172)] });
      continue;
    }

    /* ======== AI 聊天 ======== */
    if (text.startsWith("/chat ")) {
      const question = text.slice(6).trim();
      console.log("[chat] prompt =", question);
      try {
        const url = 'https://api.siliconflow.cn/v1/chat/completions';
        const options = {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.SILICONFLOW_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: "moonshotai/Kimi-K2-Instruct-0905",
            messages: [{
              role: "user",
              content: question
            }]
          })
        };

        const response = await fetch(url, options);
        const json = await response.json();
        console.log(json);

        // 假设 API 返回的结构中，答案在 choices[0].message.content
        const answer = json.choices?.[0]?.message?.content || "未能获取到 AI 回复。";

        await bot.send_msg({
          ...context,
          message: [Structs.text(answer)],
        });
      } catch (e) {
        console.error("[chat] fetch error", e);
        await bot.send_msg({
          ...context,
          message: [Structs.text("聊天服务暂时不可用～")],
        });
      }
      continue;
    }

    /* ======== 万能 NC 命令 ======== */
    if (text.startsWith("!")) {
      const arr = text.slice(1).split(" ");
      const commandName = arr[0] as keyof WSSendParam;
      const args = JSON.parse(arr.slice(1).join(" ") || "{}");
      try {
        const res = await bot.send(commandName, args);
        await bot.send_msg({
          ...context,
          message: [Structs.text(JSON.stringify(res, null, 2))],
        });
      } catch (error) {
        await bot.send_msg({
          ...context,
          message: [
            Structs.text("发送请求出错\n"),
            Structs.text(JSON.stringify(error, null, 2)),
          ],
        });
      }
      continue;
    }

    /* ======== 未识别指令 ======== */
    /* 什么都不做，或留一个提示：
    await bot.send_msg({
      ...context,
      message: [Structs.text("未知指令，发送 /h 查看帮助。")],
    });
    */
  }
});

bot.on("notice", async (event) => {
  console.log("\n收到了一条通知");
  console.dir(event, { depth: null });
});

bot.on("request", async (event) => {
  console.log("\n收到了一条请求");
  console.dir(event, { depth: null });
});

await bot.connect();
console.log("连接成功");
