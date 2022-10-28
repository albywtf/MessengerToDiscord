import fs from "fs";
import login from "facebook-chat-api";
import {
  ChannelType,
  Client,
  Partials,
  WebhookClient,
} from "discord.js";
require('dotenv').config();
const guild_id = process.env.GUILD_ID;
const token = process.env.DISCORD_TOKEN;
const client = new Client({
  intents: [
    "Guilds",
    "DirectMessages",
    "GuildMessages",
    "MessageContent",
    "GuildWebhooks",
  ],
  partials: [Partials.Channel, Partials.Message],
});
const credential = {
  appState: JSON.parse(fs.readFileSync("appstate.json", "utf-8")),
};

type ConfigType = {
  channelId: string;
  userId: string;
  webhook: string;
  name: string;
  webhook_self: string;
};

client.on("ready", () => {
  console.log("Discord client ready");
  console.log("Configuring...");
  try {
      const config_file = fs.readFileSync('./config.json', 'utf-8');
  } catch {
    fs.writeFileSync('./config.json', '[]', 'utf-8');
  }
  
  client.user.setActivity("Online");
  //login to facebook
  login(credential, (err, api) => {
    if (err) return console.error(err);
    api.setOptions({ selfListen: true });
    //listen for discord messages
    client.on("messageCreate", async (message) => {
      if (message.webhookId) return;
      const config: ConfigType[] = JSON.parse(
        fs.readFileSync("./config.json", "utf-8")
      );
      for (let i = 0; i < config.length; i++) {
        if (config[i].channelId == message.channelId) {
          api.sendMessage(message.content, config[i].userId);
        }
      }
      message.delete();
    });

    //listen for incoming facebook messages
    api.listenMqtt((err, message) => {
      if (message.type !== "message") return;
      const config: ConfigType[] = JSON.parse(
        fs.readFileSync("./config.json", "utf-8")
      );
      const user = config.filter((user) => user.userId == message.threadID)[0];
      if (user) {
        const webhookClient = new WebhookClient({
          url: message.senderID == message.threadID ? user.webhook : user.webhook_self,
        });
        webhookClient.send(message.body);
        return;
      }
      api.getUserInfo(message.threadID, (err, user_data) => {
        if (err) return console.error(err);
        //create channel & webhook
        console.log("Creating Channel...");
        const guild = client.guilds.cache.get(guild_id);
        guild.channels
          .create({
            type: ChannelType.GuildText,
            name: user_data[message.threadID].name,
          })
          .then((channel) => {
            console.log("Creating Webhook...");
            channel
              .createWebhook({
                avatar: user_data[message.threadID].thumbSrc,
                name: user_data[message.threadID].name,
              })
              .then((webhook) => {
                console.log("Creating Self Webhook")
                channel
                  .createWebhook({
                    name: 'You',
                  })
                  .then((webhook_self) => {
                    console.log("Creating Config...");
                    let temp_config = config;
                    const new_config = {
                      name: user_data[message.threadID].name,
                      channelId: channel.id,
                      userId: message.threadID,
                      webhook: webhook.url,
                      webhook_self: webhook_self.url,
                    };
                    temp_config.push(new_config);
                    fs.writeFileSync(
                      "./config.json",
                      JSON.stringify(temp_config),
                      "utf-8"
                    );
                    //send message
                    console.log("Sending Message...");
                    const webhookClient = new WebhookClient({
                      url: message.senderID == message.threadID ? webhook.url : webhook_self.url,
                    });
                    webhookClient.send(message.body);
                  });
              });
          });
      });
    });
  });
});

//login to discord
client.login(token);
