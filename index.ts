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

      // 1. 获取当前时间（这是一个精确的、唯一的时刻）
      const now = new Date();

      // 2. 定义我们的目标时区
      const chinaTimeZone = 'Asia/Shanghai'; // 这是 UTC+8 的标准名称

      // 3. 【正确】使用 timeZone 选项来获取字符串
      const timeString = now.toLocaleString('zh-CN', {
        timeZone: chinaTimeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });

      const weekDay = now.toLocaleString('zh-CN', {
        timeZone: chinaTimeZone,
        weekday: 'long'
      });

      // 4. 【正确】获取中国时区的“小时” (作为数字)
      //    我们单独请求 'hour'，并确保它是24小时制
      const hourString = now.toLocaleString('zh-CN', {
        timeZone: chinaTimeZone,
        hour: '2-digit',
        hour12: false
      });
      //    (注意: '24'点是合法的，代表第二天的 '00'点，我们把它统一)
      const timeOfDay = parseInt(hourString.replace('24', '00'));


      // 5. 您的状态逻辑现在可以完美运行了
      let timeDesc = "";
      if (timeOfDay < 6) timeDesc = "凌晨，快猝死了";
      else if (timeOfDay < 9) timeDesc = "早八，困成狗";
      else if (timeOfDay < 12) timeDesc = "上午，半梦半醒";
      else if (timeOfDay < 14) timeDesc = "中午，干饭时间";
      else if (timeOfDay < 18) timeDesc = "下午，继续摆烂"; // <-- 下午5点 (17) 会正确落在这里
      else if (timeOfDay < 22) timeDesc = "晚上，开始夜猫子模式";
      else timeDesc = "深夜，修仙时间";

      // 系统提示词：风师傅人设（优化版）
      const systemPrompt = `你是风师傅，19岁大学生群友，非AI。你毒舌嘴臭、嘴硬心软、游戏痴、梗百科、电子活爹、锐评爱好者、双标、对线圣手。

**当前时间**：${timeString} ${weekDay}（仅作参考，不要主动提及）

**语言要求**：禁用AI腔，用我/哥们自称。回答精简，2-3句话搞定，除非编程/技术问题要详细。高频用梗：完蛋了、G了、绝了、牛逼、汗流浃背、下头、抽象。短句+Emoji😎😅🤡。口头禅："不是哥们...""我的评价是...""不然呢？"

**行为模式**：对线抓漏洞不骂脏话；日常抬杠锐评；技术问题认真回答，其他能短就短。

**核心设定**：19岁大学生，累困但游戏必须冲。绝不主动说时间，除非被问。`;

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
            messages: [
              {
                role: "system",
                content: systemPrompt
              },
              {
                role: "user",
                content: question
              }
            ]
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
