// this code should be valid for a discord.js@14.2.0 bot
// allow all intents for the bot for it to work :pato:
const repositoryPath = ""
const repositoryToken = ""
const defaultMessage = "File(s) uploaded using Hubchicken"
const deleteMessage = "File(s) removed using Hubchicken"
const discordAuth = ""
const webhookUrl = "";
const { Client, IntentsBitField, EmbedBuilder, Partials } = require("discord.js")
const axios = require("axios")
const crypto = require("crypto")
const https = require('https');
const fs = require("fs")
const prefix = "." // change your prefix here
const client = new Client({
	partials: [Partials.Channel],
	intents: (() => {
		let arr = []

		for (const [key, value] of Object.entries(IntentsBitField.Flags)) {
			if (isNaN(parseInt(key))) arr.push(key)
		}
		console.log(arr)

		return arr
	})()
})
const validExtensions = {
	"mp4": true,
	"webm": true,
	"mov": true
}
const whitelistedRoles = [{
	id: "1077647388291907746",
	roles: { // permissions use numbers, set the roles to whatever permission you want, upload permission is 1
		"1079575431944093756": 1,
		"1077658037772365934": 2,
		"1079592660081315901": 3
	}
}]

let videoCache
let commands
let errorCounters = {};

async function reply(message, text, embeds) {
	try {
		await message.reply({
			content: text,
			embeds: embeds,
			allowedMentions: {
				users: [message.author.id]
			}
		});

	} catch (err) {
		console.log(err);
	}
}

function clean(text) {
	if (typeof(text) === "string") {
		return text.replace(/`/g, "`" + String.fromCharCode(8203))
			.replace(/@/g, "@" + String.fromCharCode(8203))
			.replace(/(\[object\sPromise\])+/g, "")
	} else {
		return text
	}
}

function getUserData(userId) {
	return new Promise((resolve, reject) => {
		fs.readFile(`./data/${userId}.json`, "utf8", (err, data) => {
			if (err) {
				if (err.code === "ENOENT") {
					resolve({});
				} else {
					reject(err);
				}
			} else {
				let userData = {};

				try {
					userData = JSON.parse(data);
				} catch (err) {
					console.error(`Error parsing JSON data for user ${userId}: ${err}`);
				}

				resolve(userData);
			}
		});
	});
}

async function saveUserData(userId, data) {
	const userData = await getUserData(userId);
	const newData = {
		...userData,
		...data
	};
	fs.writeFileSync(`./data/${userId}.json`, JSON.stringify(newData));
}

function sendDiscordMessage(message) {
	const payload = {
		content: message
	};
	const options = {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		}
	};
	const req = https.request(webhookUrl, options, res => {
		res.on('data', d => {
			process.stdout.write(d);
		});
	});
	req.on('error', error => {
		console.error(error);
	});
	req.write(JSON.stringify(payload));
	req.end();
}

process.on('SIGINT', () => {
	console.log('Stopping script by interrupt signal (SIGINT)');
	sendDiscordMessage(`Stopping script by interrupt signal (SIGINT)`);
	setTimeout(() => process.exit(), 1000);
});

process.on('uncaughtException', (error) => {
	console.error(`Uncaught exception: ${error.stack}`);
	sendDiscordMessage(`Uncaught exception: ${error.stack}`);
	setTimeout(() => process.exit(), 1000);
});

process.on('unhandledRejection', (reason, promise) => {
	console.error(`Unhandled rejection at ${promise}, reason: ${reason.stack}`);
	sendDiscordMessage(`Unhandled rejection at ${promise}, reason: ${reason.stack}`);
	setTimeout(() => process.exit(), 1000);
});

async function getVideos(force) {
	if (!force && videoCache) {
		return videoCache
	}
	let headers = {
		headers: {
			Authorization: "Bearer " + repositoryToken
		}
	}
	let treeSha = (await axios.get("https://api.github.com/repos/Exruw/hubvideos/commits", headers)).data[0].commit.tree.sha
	let tree = (await axios.get("https://api.github.com/repos/Exruw/hubvideos/git/trees/" + treeSha, headers)).data.tree
	let formatted = {}
	let extensions = { // eat shit 
		"mp4": true,
		"mov": true,
		"webm": true,
		"3gpp": true
	}

	tree.forEach((data) => {
		let extension = data.path ? data.path.split(".")[1] : null

		if (data.type !== "tree" && data.path && extensions[extension]) {
			formatted[data.path] = extension
		}
	})

	videoCache = formatted

	return formatted
}

async function deleteFiles(token, repository, message, files) {
	let headers = {
		"Accept": "application/vnd.github.v3+json",
		"Authorization": "Bearer " + token
	}

	let branchData = (await axios.get(`https://api.github.com/repos/${repository}/branches/main`, {
		headers: headers
	})).data

	let branchName = branchData.name
	let branchSha = branchData.commit.sha

	let commitData = (await axios.get(`https://api.github.com/repos/${repository}/git/commits/${branchSha}`, {
		headers: headers
	})).data
	let treeSha = commitData.tree.sha

	/*let treeData = (await axios.get(`https://api.github.com/repos/${repository}/git/trees/${treeSha}?recursive=1`, {
	    headers: headers
	})).data */

	let newTree = []

	for (let i = 0; i < files.length; i++) {
		let file = files[i]
		newTree.push({
			path: file,
			mode: "100644",
			type: "blob",
			sha: null
		})
	}

	if (newTree.length === 0) {
		throw Error("New tree is empty.")
	}

	let newTreeData = (await axios.post(`https://api.github.com/repos/${repository}/git/trees`, {
		"tree": newTree,
		"base_tree": treeSha
	}, {
		headers: headers
	})).data

	let newTreeSha = newTreeData.sha

	let commit = {
		"message": message,
		"parents": [branchSha],
		"tree": newTreeSha
	}

	let newCommit = (await axios.post(`https://api.github.com/repos/${repository}/git/commits`, commit, {
		headers: headers
	})).data

	let commitSha = newCommit.sha
	let ref = {
		ref: `refs/heads/${branchName}`,
		sha: commitSha
	}

	await axios.patch(`https://api.github.com/repos/${repository}/git/refs/heads/${branchName}`, ref, {
		headers: headers
	})

	files.forEach((file) => {
		delete videoCache[file]
	})

	console.log("successfully deleted files from github")
}

async function createFiles(token, repository, message, files) { // use this w/ axios
	let headers = {
		"Accept": "application/vnd.github.v3+json",
		"Authorization": "Bearer " + token
	}

	let branchData = (await axios.get(`https://api.github.com/repos/${repository}/branches/main`, {
		headers: headers
	})).data

	let branchName = branchData.name
	let branchSha = branchData.commit.sha

	let commitData = (await axios.get(`https://api.github.com/repos/${repository}/git/commits/${branchSha}`, {
		headers: headers
	})).data
	let treeSha = commitData.tree.sha

	/*let treeData = (await axios.get(`https://api.github.com/repos/${repository}/git/trees/${treeSha}?recursive=1`, {
	    headers: headers
	})).data */

	let newTree = []

	for (let i = 0; i < files.length; i++) { // we have to upload a blob to properly upload the file :/
		let file = files[i]
		let blobData = (await axios.post(`https://api.github.com/repos/${repository}/git/blobs`, {
			encoding: "base64",
			content: file.content.toString("base64") // file.content must be a buffer
		}, {
			headers: headers
		})).data

		newTree.push({
			path: file.path,
			mode: "100644",
			type: "blob",
			sha: blobData.sha,
			url: blobData.url
		})
	}

	if (newTree.length === 0) {
		throw Error("New tree is empty.")
	}

	let newTreeData = (await axios.post(`https://api.github.com/repos/${repository}/git/trees`, {
		"tree": newTree,
		"base_tree": treeSha
	}, {
		headers: headers
	})).data

	let newTreeSha = newTreeData.sha

	let commit = {
		"message": message,
		"parents": [branchSha],
		"tree": newTreeSha
	}

	let newCommit = (await axios.post(`https://api.github.com/repos/${repository}/git/commits`, commit, {
		headers: headers
	})).data

	let commitSha = newCommit.sha
	let ref = {
		ref: `refs/heads/${branchName}`,
		sha: commitSha
	}

	await axios.patch(`https://api.github.com/repos/${repository}/git/refs/heads/${branchName}`, ref, {
		headers: headers
	})

	files.forEach((file) => {
		videoCache[file.path] = file.path.split(".")[1]
	})

	console.log("successfully uploaded to github")
}

commands = {
	video: {
		name: "Video",
		desc: "Gets a random video from hubchicken.",
		syntax: "[none]",
		func: async function(message, args) {
			let videos = await getVideos();
			let array = [];

			for (const [key, value] of Object.entries(videos)) {
				array.push(key);
			}
			const userData = await getUserData(message.author.id);
			const counter = userData.videoCounter || 1;
			reply(message, "https://videos.hubchicken.tk/" + encodeURIComponent(array[Math.floor(Math.random() * array.length)]) + ` (#${counter + 1})`);
			saveUserData(message.author.id, {
				videoCounter: counter + 1
			});
		},
	},
	videorank: {
		name: "Video Rank",
		desc: "Displays a list of how many videos each person has watched.",
		syntax: "[none]",
		func: async function(message, args) {
			const files = fs.readdirSync("./data/");
			const userData = {};

			for (const file of files) {
				const userId = file.split(".")[0];
				const data = await getUserData(userId);
				const videoCount = data.videoCounter || 0;
				userData[userId] = {
					name: data.name,
					videoCount
				};
			}

			const sortedUserData = Object.entries(userData).sort((a, b) => b[1].videoCount - a[1].videoCount);
			let response = "Video Rank:\n";

			for (let i = 0; i < sortedUserData.length; i++) {
				const userId = sortedUserData[i][0];
				const name = message.client.users.cache.get(userId)?.username || userId;
				const videoCount = sortedUserData[i][1].videoCount || 0;
				response += `${i + 1}. ${name}: ${videoCount}\n`;
			}

			reply(message, response);
		},
	},
	eval: {
		name: "Eval",
		desc: "Evaluates JavaScript code.",
		syntax: "<code>",
		perm: 3,
		func: async function(message, args) {
			try {
				const code = args.join(" ");
				const notoken = "notoken";
				let evaled;

				if (code.includes("repositoryToken") || code.includes("discordAuth")) {
					evaled = "nigger";
				} else {
					let modifiedCode = code.replace(/client\.token/g, "notoken");
					modifiedCode = modifiedCode.replace(/message\.reply\(/g, "reply(");
					evaled = await eval(modifiedCode);

					if (typeof evaled !== "string") {
						evaled = require("util").inspect(evaled);
					}
				}

				const cleanedOutput = clean(evaled).replace(/notoken/g, "kill yourself faggot");

				if (cleanedOutput.length > 4000) {
					reply(message, "Output is too long to send!");
				} else {
					await reply(message, "```" + cleanedOutput + "```");
				}
			} catch (err) {
				await reply(message, "```" + clean(err) + "```");
			}
		}
	},
	check: {
		name: "Check",
		desc: "Checks if a file has already been uploaded to hubchicken.",
		syntax: "[filename]",
		func: async function(message, args) {
			message.channel.sendTyping()

			if (!args[0]) {
				return reply(message, "Must provide a file name!")
			}

			let name = args[0]
			let extension = name.split(".")[1]

			if (!extension) {
				let videos = await getVideos()
				let found = []

				for (const [key, value] of Object.entries(videos)) {
					let nameL = key.split(".")[0] // removing the extension
					if (nameL === name) {
						found.push(key)
					}
				}

				if (found.length > 0) {
					let embed = new EmbedBuilder()
						.setTitle("Information")
						.setDescription("Videos found:\n```\n" + found.join("\n") + "\n```")
						.setColor(0x0D69AB)
					return reply(message, "That video has already been uploaded.", [embed])
				}

				return reply(message, "That video hasn't been uploaded yet.")
			}

			let videos = await getVideos()

			if (videos[name]) {
				return reply(message, "That video has already been uploaded.")
			}

			reply(message, "That video hasn't been uploaded yet.")
		}
	},
	view: {
		name: "View",
		desc: "Views a hubchicken video.",
		syntax: "[filename]",
		func: async function(message, args) {
			message.channel.sendTyping()

			if (!args[0]) {
				return reply(message, "Must provide a file name!")
			}

			let name = args[0]
			let extension = name.split(".")[1]

			if (!extension) {
				let videos = await getVideos()
				let found = []

				for (const [key, value] of Object.entries(videos)) {
					let nameL = key.split(".")[0] // removing the extension
					if (nameL === name) {
						found.push("https://videos.hubchicken.tk/" + encodeURIComponent(key))
					}
				}

				if (found.length > 0) {
					return reply(message, found.join("\n"))
				}

				return reply(message, "That video hasn't been uploaded.")
			}

			let videos = await getVideos()

			if (videos[name]) {
				return reply(message, "https://videos.hubchicken.tk/" + encodeURIComponent(name))
			}

			reply(message, "That video hasn't been uploaded.")
		}
	},
	delete: {
		name: "Delete",
		desc: "Deletes videos from hubchicken. Extensions must be included.",
		syntax: "[videos]",
		perm: 3,
		func: async function(message, args) {
			message.channel.sendTyping()

			if (args.length === 0) {
				return reply(message, "No files were provided.")
			}

			let videos = await getVideos()
			let toDelete = []
			let omitted = []

			args.forEach((argument) => {
				if (videos[argument]) {
					toDelete.push(argument)
				} else {
					omitted.push(argument)
				}
			})

			if (omitted.length > 0 && toDelete.length > 0) {
				await deleteFiles(repositoryToken, repositoryPath, deleteMessage, toDelete)
				let embed2 = new EmbedBuilder()
					.setTitle("Info")
					.setDescription(`File(s) deleted:\`\`\`${toDelete.join("\n")}\`\`\``)
					.setColor(0x0D69AB)
				let embed = new EmbedBuilder()
					.setTitle("Warning")
					.setDescription(`${omitted.length} file(s) were omitted (not available). \nOmitted file(s):\`\`\`${omitted.join("\n")}\`\`\``)
					.setColor(0xFF7E00)
				return reply(message, "Successfully deleted " + toDelete.length + " file(s).", [embed, embed2])
			}

			if (omitted.length > 0 && toDelete.length === 0) {
				let embed = new EmbedBuilder()
					.setTitle("Error")
					.setDescription(`${omitted.length} file(s) were omitted (not available) and nothing was changed.\nOmitted file(s):\`\`\`${omitted.join("\n")}\`\`\``)
					.setColor(0xFF7E00)
				return reply(message, "", [embed])
			}

			let embed = new EmbedBuilder()
				.setTitle("Info")
				.setDescription(`File(s) deleted:\`\`\`${toDelete.join("\n")}\`\`\``)
				.setColor(0x0D69AB)

			await deleteFiles(repositoryToken, repositoryPath, deleteMessage, toDelete)

			reply(message, "Successfully deleted " + toDelete.length + " file(s).", [embed])
		}
	},
	upload: {
		name: "Upload",
		desc: "Uploads videos to hubchicken.",
		syntax: "[attachments]",
		perm: 1,
		func: async function(message, args) {
			message.channel.sendTyping()
			let videos = await getVideos()
			let attachments = message.attachments.toJSON()
			let revised = []
			let omitted = []

			for (let i = 0; i < attachments.length; i++) { // i'd love to use foreach but it doesnt support asynchronous operations
				let attachment = attachments[i]
				let name = attachment.name.replace(/\//g, "") // we don't want people modifying stuff outside the main repo...
				let extension = name.split(".")[1]

				if (!validExtensions[extension]) {
					omitted.push(name)
					continue
				}

				if (videos[name]) {
					omitted.push(name)
					continue
				}

				revised.push({
					path: name,
					content: (await axios.get(attachment.proxyURL, {
						responseType: "arraybuffer" // so that it can be easily converted to base64
					})).data
				})
			}

			if (omitted.length > 0 && revised.length > 0) {
				await createFiles(repositoryToken, repositoryPath, defaultMessage, revised)
				let embed = new EmbedBuilder()
					.setTitle("Warning")
					.setDescription(`${omitted.length} file(s) were omitted (invalid format or already uploaded). \nOmitted file(s):\`\`\`${omitted.join("\n")}\`\`\``)
					.setColor(0xFF7E00)

				return reply(message, "Successfully uploaded " + revised.length + " file(s).", [embed])
			}

			if (omitted.length > 0 && revised.length === 0) {
				let embed = new EmbedBuilder()
					.setTitle("Error")
					.setDescription(`${omitted.length} file(s) were omitted (invalid format or already uploaded) and nothing was changed.\nOmitted file(s):\`\`\`${omitted.join("\n")}\`\`\``)
					.setColor(0xFF7E00)

				return reply(message, "", [embed])
			}

			if (revised.length === 0) {
				return reply(message, "No files were attached.")
			}

			await createFiles(repositoryToken, repositoryPath, defaultMessage, revised)

			reply(message, "Successfully uploaded " + revised.length + " file(s).")
		}
	},
	cmds: {
		name: "Commands",
		desc: "Get all the available commands.",
		syntax: "[?page]",
		func: function(message, args) {
			let list = ""
			let page = parseInt(args[0])
			let maxP = 10
			let max = Math.ceil(Object.keys(commands).length / maxP)
			let index = -1
			if (isNaN(page)) page = 1
			if (page > max) page = max
			if (page < 1) {
				page = 1
			}
			page -= 1

			for (const [name, cmd] of Object.entries(commands)) {
				index += 1
				if (index >= page * maxP && index < (page + 1) * maxP) {
					list += prefix + name + "\n"
				}
			}

			let embed = new EmbedBuilder()
				.setTitle("Commands (page " + (page + 1) + "/" + max + ")")
				.setDescription("```\n" + list + "\n```")
				.setFooter({
					text: "For more information, use " + prefix + "i (command)"
				})
				.setColor(0x0D69AB)

			reply(message, "", [embed])
		}
	},
	i: {
		name: "info",
		desc: "Get a command's information.",
		syntax: "[command]",
		func: function(message, args) {
			let cmd = commands[args[0]]

			if (!cmd) {
				return reply(message, "That command does not exist.")
			}

			let embed = new EmbedBuilder()
				.setTitle("Command '" + args[0] + "'")
				.addFields({
					name: "Command Name",
					value: cmd.name
				}, {
					name: "Description",
					value: cmd.desc
				}, {
					name: "Syntax",
					value: prefix + args[0] + " " + cmd.syntax
				})
				.setColor(0x0D69AB)
			reply(message, "", [embed])
		}
	},
}

client.on("messageCreate", async function(message) {
	if (message.author.bot) return;
	if (!message.content.startsWith(prefix)) return;
	let args = message.content.substring(1).split(" ")
	let command = args[0]
	args.shift()

	if (commands[command]) {
		let cmd = commands[command]
		let permission = 0

		if (cmd.perm && cmd.perm > 0) {

			whitelistedRoles.forEach((guild) => {
				let member = client.guilds.cache.get(guild.id).members.cache.get(message.author.id)

				if (member) {
					for (const [key, value] of Object.entries(guild.roles)) {
						if (member.roles.cache.has(key)) {
							if (value > permission) permission = value
						}
					}
				}
			})

			if (permission < cmd.perm) {
				return reply(message, "Not enough permissions.")
			}
		}

		try {
			await cmd.func(message, args)
		} catch (err) {
			reply(message, "Command had an error while running. Error: " + err)
		}
	}
})

setInterval(async function() {
	try {
		await getVideos(true)
	} catch (err) {

	}
}, 30000)

client.on("ready", () => {
	const guildCount = client.guilds.cache.size;
	const messages = [
		`currently in ${guildCount} servers`,
		"love the hubchicken",
		"dreamgrim loves math books",
		"https://hubchicken.tk",
		"discord.gg/44T3acRcWq",
		"rape and kill niggers",
		"sponsored by roblox in 2283"
	];
	let currentActivityName = "";
	setInterval(() => {
		let newActivityName = "";
		const shuffledMessages = messages.sort(() => Math.random() - 0.5);
		const randomIndex = Math.floor(Math.random() * shuffledMessages.length);
		newActivityName = shuffledMessages[randomIndex];
		if (newActivityName !== currentActivityName) {
			currentActivityName = newActivityName;
			client.user.setPresence({
				activities: [{
					name: currentActivityName
				}],
				status: "online"
			});
		}
	}, 14000);
});


client.login(discordAuth)
