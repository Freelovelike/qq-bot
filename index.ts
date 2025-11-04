import "dotenv/config";
import * as os from "node:os";
import { HttpsProxyAgent } from "https-proxy-agent";
import {
	NCWebsocket,
	type NCWebsocketOptions,
	Structs,
	type WSSendParam,
} from "node-napcat-ts";

// 信息搜索服务
interface SearchResult {
	source: string;
	content: string;
	confidence: number;
}

// 联网判断函数 - 使用关键词匹配，快速高效
function needsOnlineSearch(query: string): boolean {
	const needSearchKeywords = [
		"天气",
		"weather",
		"气温",
		"温度",
		"下雨",
		"下雪",
		"刮风",
		"新闻",
		"news",
		"最新",
		"最近",
		"今天",
		"明天",
		"昨天",
		"维基",
		"wiki",
		"百科",
		"定义",
		"什么是",
		"是谁",
		"介绍",
		"搜索",
		"search",
		"查找",
		"查询",
		"百度",
		"谷歌",
	];

	const queryLower = query.toLowerCase();
	return needSearchKeywords.some((keyword) =>
		queryLower.includes(keyword.toLowerCase()),
	);
}

// AI辅助联网判断 - 使用NVIDIA模型，快速高效
async function aiNeedsOnlineSearch(query: string): Promise<boolean> {
	// 先进行快速关键词判断
	if (needsOnlineSearch(query)) {
		return true;
	}

	try {
		const url = "https://integrate.api.nvidia.com/v1/chat/completions";
		const options = {
			method: "POST",
			headers: {
				Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model: "qwen/qwen3-coder-480b-a35b-instruct",
				messages: [
					{
						role: "system",
						content:
							"判断用户问题是否需要联网搜索获取实时信息或专业知识。需要搜索的问题类型：1.实时信息（天气、新闻、股价等）2.专业知识（定义、概念、事实等）3.最新动态。只回答'是'或'否'，不要解释。",
					},
					{
						role: "user",
						content: query,
					},
				],
				temperature: 0.1,
				max_tokens: 10,
			}),
			agent: process.env.HTTPS_PROXY
				? new HttpsProxyAgent(process.env.HTTPS_PROXY)
				: undefined,
		};

		const response = await fetch(url, options);
		const data = await response.json();
		const answer = data.choices?.[0]?.message?.content?.trim() || "否";

		console.log(`[NVIDIA联网判断] 问题:"${query}" -> 需要搜索:${answer}`);
		return answer.includes("是");
	} catch (error) {
		console.error("[NVIDIA联网判断] 出错:", error);
		return false; // 出错时默认不搜索
	}
}

// AI服务类型判断 - 使用NVIDIA模型判断应该使用哪种搜索服务
type SearchServiceType =
	| "weather"
	| "wikipedia"
	| "news"
	| "search"
	| "github_trending"
	| "github_repo"
	| "url_content"
	| "none";

async function aiDetermineSearchService(
	query: string,
): Promise<SearchServiceType> {
	// 先进行快速关键词匹配判断
	const queryLower = query.toLowerCase();

	// 检查是否为直接的URL
	if (/^https?:\/\//.test(queryLower)) {
		// 检查是否为GitHub Raw URL
		if (queryLower.includes("raw.githubusercontent.com")) {
			return "url_content";
		}
		// 检查是否为GitHub仓库链接
		if (/https:\/\/github\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)/.test(queryLower)) {
			return "github_repo";
		}
		// 其他普通URL也直接获取内容
		return "url_content";
	}

	// GitHub趋势相关关键词
	const trendingKeywords = ["github", "趋势", "trending", "热门", "开源项目"];
	if (
		trendingKeywords.some((keyword) =>
			queryLower.includes(keyword.toLowerCase()),
		)
	) {
		return "github_trending";
	}

	// 天气相关关键词
	const weatherKeywords = [
		"天气",
		"weather",
		"气温",
		"温度",
		"下雨",
		"下雪",
		"刮风",
		"预报",
	];
	if (
		weatherKeywords.some((keyword) =>
			queryLower.includes(keyword.toLowerCase()),
		)
	) {
		return "weather";
	}

	// 维基百科/百科相关关键词
	const wikiKeywords = [
		"维基",
		"wiki",
		"百科",
		"定义",
		"什么是",
		"是谁",
		"介绍",
		"概念",
	];
	if (
		wikiKeywords.some((keyword) => queryLower.includes(keyword.toLowerCase()))
	) {
		return "wikipedia";
	}

	// 新闻相关关键词
	const newsKeywords = [
		"新闻",
		"news",
		"最新",
		"最近",
		"今天",
		"明天",
		"昨天",
		"热点",
		"资讯",
	];
	if (
		newsKeywords.some((keyword) => queryLower.includes(keyword.toLowerCase()))
	) {
		return "news";
	}

	// 搜索相关关键词
	const searchKeywords = ["搜索", "search", "查找", "查询", "百度", "谷歌"];
	if (
		searchKeywords.some((keyword) => queryLower.includes(keyword.toLowerCase()))
	) {
		return "search";
	}

	// 如果关键词匹配无法确定，使用NVIDIA AI进行更精确的判断
	try {
		const url = "https://integrate.api.nvidia.com/v1/chat/completions";
		const options = {
			method: "POST",
			headers: {
				Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model: "qwen/qwen3-coder-480b-a35b-instruct",
				messages: [
					{
						role: "system",
						content:
							"分析用户问题类型并选择最适合的搜索服务。可选服务：weather（天气查询）、wikipedia（百科知识）、news（新闻资讯）、search（通用搜索）。只回答服务名称，不要解释。",
					},
					{
						role: "user",
						content: query,
					},
				],
				temperature: 0.1,
				max_tokens: 10,
			}),
			agent: process.env.HTTPS_PROXY
				? new HttpsProxyAgent(process.env.HTTPS_PROXY)
				: undefined,
		};

		const response = await fetch(url, options);
		const data = await response.json();
		const answer = data.choices?.[0]?.message?.content?.trim() || "search";

		console.log(`[NVIDIA服务判断] 问题:"${query}" -> 服务类型:${answer}`);

		// 验证返回的服务类型是否有效
		const validServices: SearchServiceType[] = [
			"weather",
			"wikipedia",
			"news",
			"search",
		];
		if (validServices.includes(answer as SearchServiceType)) {
			return answer as SearchServiceType;
		}

		return "search"; // 默认使用通用搜索
	} catch (error) {
		console.error("[NVIDIA服务判断] 出错:", error);
		return "search"; // 出错时默认使用通用搜索
	}
}

// 维基百科搜索
async function searchWikipedia(query: string): Promise<SearchResult | null> {
	try {
		// 简单的维基百科搜索实现
		const searchUrl = `https://zh.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*`;
		const response = await fetch(searchUrl, {
			agent: process.env.HTTPS_PROXY
				? new HttpsProxyAgent(process.env.HTTPS_PROXY)
				: undefined,
		});
		const data = await response.json();

		if (data.query?.search?.[0]) {
			const title = data.query.search[0].title;
			const snippet = data.query.search[0].snippet.replace(/<[^>]*>/g, "");

			// 获取详细内容
			const contentUrl = `https://zh.wikipedia.org/w/api.php?action=query&prop=extracts&exintro&titles=${encodeURIComponent(title)}&format=json&origin=*`;
			const contentResponse = await fetch(contentUrl, {
				agent: process.env.HTTPS_PROXY
					? new HttpsProxyAgent(process.env.HTTPS_PROXY)
					: undefined,
			});
			const contentData = await contentResponse.json();

			const pages = contentData.query.pages;
			const pageId = Object.keys(pages)[0];
			const extract = pages[pageId].extract;

			if (extract && extract.length > 50) {
				return {
					source: "wikipedia",
					content: `维基百科：${title}\n${extract.substring(0, 500)}...`,
					confidence: 0.9,
				};
			}
		}
	} catch (error) {
		console.error("维基百科搜索失败:", error);
	}
	return null;
}

// 天气查询
async function searchWeather(query: string): Promise<SearchResult | null> {
	try {
		// 提取城市名称
		const cityMatch = query.match(/(.+?)(?:的?天气|weather)/i);
		const city = cityMatch ? cityMatch[1].trim() : "北京";

		const weatherUrl = `https://devapi.qweather.com/v7/weather/now?location=${encodeURIComponent(city)}&key=${process.env.QWEATHER_API_KEY}`;
		const response = await fetch(weatherUrl, {
			agent: process.env.HTTPS_PROXY
				? new HttpsProxyAgent(process.env.HTTPS_PROXY)
				: undefined,
		});
		const data = await response.json();

		if (data.code === "200" && data.now) {
			return {
				source: "weather",
				content: `${city}当前天气：${data.now.text}，温度${data.now.temp}°C，湿度${data.now.humidity}%，风速${data.now.windSpeed}km/h`,
				confidence: 0.95,
			};
		}
	} catch (error) {
		console.error("天气查询失败:", error);
	}
	return null;
}

// 新闻搜索
async function searchNews(query: string): Promise<SearchResult | null> {
	try {
		// 使用 NewsData API
		const newsUrl = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&language=zh&sortBy=publishedAt&pageSize=3&apiKey=${process.env.NEWSDATA_API_KEY}`;
		const response = await fetch(newsUrl, {
			agent: process.env.HTTPS_PROXY
				? new HttpsProxyAgent(process.env.HTTPS_PROXY)
				: undefined,
		});
		const data = await response.json();

		if (data.status === "ok" && data.articles && data.articles.length > 0) {
			const newsItems = data.articles
				.slice(0, 2)
				.map(
					(article: any) =>
						`📰 ${article.title}\n${article.description || ""}\n🔗 ${article.url}`,
				)
				.join("\n\n");

			return {
				source: "news",
				content: `相关新闻：\n${newsItems}`,
				confidence: 0.8,
			};
		}
	} catch (error) {
		console.error("新闻搜索失败:", error);
	}
	return null;
}

// GitHub仓库README搜索
async function searchGitHubRepo(query: string): Promise<SearchResult | null> {
	try {
		const githubRepoRegex = /https:\/\/github\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)/;
		const match = query.match(githubRepoRegex);

		if (!match) {
			return null;
		}

		const owner = match[1];
		const repo = match[2];

		// 尝试多种常见的README
		const readmeFiles = ['README.md', 'readme.md', 'ReadMe.md'];
		let readmeContent: string | null = null;

		for (const readmeFile of readmeFiles) {
			const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/${readmeFile}`;
			try {
				const response = await fetch(rawUrl, {
					agent: process.env.HTTPS_PROXY
						? new HttpsProxyAgent(process.env.HTTPS_PROXY)
						: undefined,
				});
				if (response.ok) {
					readmeContent = await response.text();
					break; // 找到一个就停止
				}
			} catch (e) {
				// 忽略错误，继续尝试下一个
			}
		}

		if (readmeContent) {
			return {
				source: 'github-repo',
				content: `从GitHub仓库 ${owner}/${repo} 的README中找到以下内容：\n\n${readmeContent.substring(0, 1000)}...`,
				confidence: 0.9,
			};
		}
	} catch (error) {
		console.error("GitHub仓库搜索失败:", error);
	}
	return null;
}

// GitHub趋势搜索
async function searchGitHubTrending(query: string): Promise<SearchResult | null> {
	try {
		// 检查是否搜索GitHub趋势相关内容
		const trendingKeywords = ['github', '趋势', 'trending', '热门', '开源项目'];
		const queryLower = query.toLowerCase();
		
		if (!trendingKeywords.some(keyword => queryLower.includes(keyword.toLowerCase()))) {
			return null;
		}

		// 获取GitHub趋势数据（使用GitHub API）
		const since = 'daily'; // daily, weekly, monthly
		
		const githubUrl = `https://api.github.com/search/repositories?q=created:>${new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]}&sort=stars&order=desc&per_page=5`;
		const response = await fetch(githubUrl, {
			headers: {
				'Accept': 'application/vnd.github.v3+json',
				'User-Agent': 'QQ-Bot/1.0'
			},
			agent: process.env.HTTPS_PROXY
				? new HttpsProxyAgent(process.env.HTTPS_PROXY)
				: undefined,
		});

		const data = await response.json();

		if (data.items && data.items.length > 0) {
			const trendingRepos = data.items.slice(0, 3).map((repo: any) => 
				`📊 ${repo.full_name}\\n⭐ ${repo.stargazers_count} stars\\n📖 ${repo.description || '无描述'}\\n🔗 ${repo.html_url}`
			).join('\\n\\n');
			
			return {
				source: 'github-trending',
				content: `GitHub每日热门项目：\\n${trendingRepos}`,
				confidence: 0.85,
			};
		}
	} catch (error) {
		console.error('GitHub趋势搜索失败:', error);
	}
	return null;
}

// 直接获取URL内容
async function searchUrlContent(query: string): Promise<SearchResult | null> {
	try {
		const response = await fetch(query, {
			agent: process.env.HTTPS_PROXY
				? new HttpsProxyAgent(process.env.HTTPS_PROXY)
				: undefined,
		});

		if (response.ok) {
			const contentType = response.headers.get("content-type") || "";
			// 只处理文本类型的内容
			if (contentType.includes("text") || contentType.includes("json") || contentType.includes("javascript")) {
				const content = await response.text();
				return {
					source: "url",
					content: `从链接 ${query} 获取到以下内容：\n\n${content.substring(0, 1500)}...`,
					confidence: 0.95,
				};
			}
		}
	} catch (error) {
		console.error("直接获取URL内容失败:", error);
	}
	return null;
}

// 聚合搜索（Serper API）
async function searchSerper(query: string): Promise<SearchResult | null> {
	try {
		const serperUrl = "https://google.serper.dev/search";
		const response = await fetch(serperUrl, {
			method: "POST",
			headers: {
				"X-API-KEY": process.env.SERPER_API_KEY!,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				q: query,
				hl: "zh-cn",
				gl: "cn",
				num: 3,
			}),
			agent: process.env.HTTPS_PROXY
				? new HttpsProxyAgent(process.env.HTTPS_PROXY)
				: undefined,
		});

		const data = await response.json();

		if (data.organic && data.organic.length > 0) {
			const results = data.organic
				.slice(0, 2)
				.map(
					(result: any) =>
						`🔍 ${result.title}\n${result.snippet}\n🔗 ${result.link}`,
				)
				.join("\n\n");
      console.log("搜索结果：", results);
			return {
				source: "serper",
				content: `搜索结果：\n${results}`,
				confidence: 0.7,
			};
		}
	} catch (error) {
		console.error("聚合搜索失败:", error);
	}
	return null;
}

// NVIDIA模型归结搜索结果
async function summarizeWithNVIDIA(
	searchResults: string,
	query: string,
): Promise<string> {
	if (!searchResults.trim()) {
		return "";
	}

	try {
		const url = "https://integrate.api.nvidia.com/v1/chat/completions";
		const options = {
			method: "POST",
			headers: {
				Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model: "qwen/qwen3-coder-480b-a35b-instruct",
				messages: [
					{
						role: "system",
						content:
							"你是一个信息总结助手。请根据搜索到的信息，简洁地回答用户的问题。如果信息有用，请提取关键信息；如果信息不相关，请回答'无相关信息'。保持回答简洁，不超过200字。",
					},
					{
						role: "user",
						content: `用户问题：${query}\n\n搜索到的信息：${searchResults}\n\n请基于这些信息简洁回答用户问题：`,
					},
				],
				temperature: 0.3,
				max_tokens: 150,
			}),
			agent: process.env.HTTPS_PROXY
				? new HttpsProxyAgent(process.env.HTTPS_PROXY)
				: undefined,
		};

		const response = await fetch(url, options);
		const data = await response.json();
		const summary = data.choices?.[0]?.message?.content?.trim() || "";

		console.log(
			`[NVIDIA归结] 原始结果长度:${searchResults.length} -> 归结后长度:${summary.length}`,
		);
		return summary;
	} catch (error) {
		console.error("[NVIDIA归结] 出错:", error);
		return searchResults; // 出错时返回原始结果
	}
}

// 智能搜索主函数
async function intelligentSearch(query: string): Promise<string> {
	console.log(`[智能搜索] 开始搜索: ${query}`);

	// 第一步：判断是否需要联网搜索
	const needsSearch = await aiNeedsOnlineSearch(query);
	if (!needsSearch) {
		console.log("[智能搜索] 无需联网搜索");
		return "";
	}

	// 第二步：判断应该使用哪种搜索服务
	const serviceType = await aiDetermineSearchService(query);
	console.log(`[智能搜索] 确定服务类型: ${serviceType}`);

	if (serviceType === "none") {
		console.log("[智能搜索] 无需特定服务");
		return "";
	}

	console.log("[智能搜索] 开始针对性搜索...");

	let searchResult = "";

	// 根据服务类型进行针对性搜索
	switch (serviceType) {
		case "github_repo":
			const repoResult = await searchGitHubRepo(query);
			if (repoResult && repoResult.content) {
				searchResult = repoResult.content;
				console.log("[智能搜索] GitHub仓库搜索成功");
			} else {
				console.log("[智能搜索] GitHub仓库搜索失败，尝试通用搜索");
			}
			break;

		case "github_trending":
			const trendingResult = await searchGitHubTrending(query);
			if (trendingResult && trendingResult.content) {
				searchResult = trendingResult.content;
				console.log("[智能搜索] GitHub趋势搜索成功");
			} else {
				console.log("[智能搜索] GitHub趋势搜索失败，尝试通用搜索");
			}
			break;

		case "weather":
			const weatherResult = await searchWeather(query);
			if (weatherResult && weatherResult.content) {
				searchResult = weatherResult.content;
				console.log("[智能搜索] 天气搜索成功");
			} else {
				console.log("[智能搜索] 天气搜索失败，尝试通用搜索");
			}
			break;

		case "wikipedia":
			const wikiResult = await searchWikipedia(query);
			if (wikiResult && wikiResult.content) {
				searchResult = wikiResult.content;
				console.log("[智能搜索] 维基百科搜索成功");
			} else {
				console.log("[智能搜索] 维基百科搜索失败，尝试通用搜索");
			}
			break;

		case "news":
			const newsResult = await searchNews(query);
			if (newsResult && newsResult.content) {
				searchResult = newsResult.content;
				console.log("[智能搜索] 新闻搜索成功");
			} else {
				console.log("[智能搜索] 新闻搜索失败，尝试通用搜索");
			}
			break;

		case "search":
			// 对于通用搜索，直接使用聚合搜索
			console.log("[智能搜索] 使用聚合搜索");
			break;
	}

	// 如果特定服务搜索失败或本来就是通用搜索，使用聚合搜索
	if (!searchResult) {
		const serperResult = await searchSerper(query);
		if (serperResult && serperResult.content) {
			searchResult = serperResult.content;
			console.log("[智能搜索] 聚合搜索成功");
		}
	}

	if (!searchResult) {
		console.log("[智能搜索] 所有搜索均未找到有效结果");
		return "";
	}

	// 第三步：使用NVIDIA模型对搜索结果进行归结
	console.log("[智能搜索] 使用NVIDIA模型进行归结...",searchResult);
	const summarizedResult = await summarizeWithNVIDIA(searchResult, query);

	return summarizedResult || searchResult; // 如果归结失败，返回原始结果
}

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
	// console.log("\n发送了一条请求");
	// console.dir(params, { depth: null });
});

bot.on("message", async (context) => {
	// console.log("\n机器人收到了一条信息\n");
	// console.dir(context, { depth: null });

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
			const chinaTimeZone = "Asia/Shanghai"; // 这是 UTC+8 的标准名称

			// 3. 【正确】使用 timeZone 选项来获取字符串
			const timeString = now.toLocaleString("zh-CN", {
				timeZone: chinaTimeZone,
				year: "numeric",
				month: "2-digit",
				day: "2-digit",
				hour: "2-digit",
				minute: "2-digit",
				hour12: false,
			});

			const weekDay = now.toLocaleString("zh-CN", {
				timeZone: chinaTimeZone,
				weekday: "long",
			});

			// 4. 【正确】获取中国时区的“小时” (作为数字)
			//    我们单独请求 'hour'，并确保它是24小时制
			const hourString = now.toLocaleString("zh-CN", {
				timeZone: chinaTimeZone,
				hour: "2-digit",
				hour12: false,
			});
			//    (注意: '24'点是合法的，代表第二天的 '00'点，我们把它统一)
			const timeOfDay = parseInt(hourString.replace("24", "00"));

			// 5. 您的状态逻辑现在可以完美运行了
			let timeDesc = "";
			if (timeOfDay < 6) timeDesc = "凌晨，快猝死了";
			else if (timeOfDay < 9) timeDesc = "早八，困成狗";
			else if (timeOfDay < 12) timeDesc = "上午，半梦半醒";
			else if (timeOfDay < 14) timeDesc = "中午，干饭时间";
			else if (timeOfDay < 18)
				timeDesc = "下午，继续摆烂"; // <-- 下午5点 (17) 会正确落在这里
			else if (timeOfDay < 22) timeDesc = "晚上，开始夜猫子模式";
			else timeDesc = "深夜，修仙时间";

			try {
				// 先进行智能搜索获取相关信息
				console.log("[chat] 开始智能搜索...");
				const searchInfo = await intelligentSearch(question);
				console.log("[chat] 智能搜索完成，结果长度:", searchInfo.length);

				// 系统提示词：风师傅人设（优化版，包含搜索信息）
				const systemPrompt = `你是风师傅，19岁大学生群友，非AI。你毒舌嘴臭、嘴硬心软、游戏痴、梗百科、电子活爹、锐评爱好者、双标、对线圣手。

**当前时间**：${timeString} ${weekDay}（仅作参考，不要主动提及）

**语言要求**：禁用AI腔，用我/哥们自称。回答精简，2-3句话搞定，除非编程/技术问题要详细。高频用梗：完蛋了、G了、绝了、牛逼、汗流浃背、下头、抽象。短句+Emoji😎😅🤡。口头禅："不是哥们...""我的评价是...""不然呢？"

**行为模式**：对线抓漏洞不骂脏话；日常抬杠锐评；技术问题认真回答，其他能短就短。

**核心设定**：19岁大学生，累困但游戏必须冲。绝不主动说时间，除非被问。

**重要规则**：如果提供了搜索信息，请基于这些信息回答问题，不要编造；如果没有搜索信息，正常回答即可。`;

				// 构建用户消息，包含搜索结果
				const userMessage = searchInfo
					? `问题：${question}\n\n[搜索到的信息]\n${searchInfo}\n\n请基于以上信息回答问题，如果没有相关信息就正常回答。`
					: question;

				const url = "https://api.siliconflow.cn/v1/chat/completions";
				const options = {
					method: "POST",
					headers: {
						Authorization: `Bearer ${process.env.SILICONFLOW_API_KEY}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						model: "moonshotai/Kimi-K2-Instruct-0905",
						messages: [
							{
								role: "system",
								content: systemPrompt,
							},
							{
								role: "user",
								content: userMessage,
							},
						],
					}),
					agent: new HttpsProxyAgent(process.env.HTTPS_PROXY || ""),
				};

				const response = await fetch(url, options);
				const json = await response.json();
				console.log(json);

				// 假设 API 返回的结构中，答案在 choices[0].message.content
				const answer =
					json.choices?.[0]?.message?.content || "未能获取到 AI 回复。";

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
	// console.log("\n收到了一条通知");
	// console.dir(event, { depth: null });
});

bot.on("request", async (event) => {
	// console.log("\n收到了一条请求");
	// console.dir(event, { depth: null });
});

await bot.connect();
console.log("连接成功");
