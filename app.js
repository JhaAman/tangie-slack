const { App } = require("@slack/bolt");

// Set up environment variables
require("dotenv").config();
var axios = require("axios");

const is_dev = process.env.NODE_ENV === "development";
const base_url = is_dev ? "http://localhost:3000" : "https://rosieos.com";

// Setup OpenAI object
const OpenAIConstructor = require("openai-api");
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const openai = new OpenAIConstructor(OPENAI_API_KEY);

const SLACK_BOT_TOKEN = is_dev
  ? process.env.DEV_SLACK_BOT_TOKEN
  : process.env.SLACK_BOT_TOKEN;
const SLACK_SIGNING_SECRET = is_dev
  ? process.env.DEV_SLACK_SIGNING_SECRET
  : process.env.SLACK_SIGNING_SECRET;
const SLACK_APP_TOKEN = is_dev
  ? process.env.DEV_SLACK_APP_TOKEN
  : process.env.SLACK_APP_TOKEN;

// Initializes your app with your bot token and app token
const app = new App({
  token: SLACK_BOT_TOKEN,
  signingSecret: SLACK_SIGNING_SECRET,
  socketMode: is_dev,
  appToken: SLACK_APP_TOKEN,
  port: process.env.PORT || 8000, // for heroku production build
});

// Listens to incoming messages that contain "hello"
app.message("", async ({ message, client, logger, say }) => {
  const thread_ts = message.thread_ts;
  const ts = message.ts;
  const id = message.channel;
  const text = message.text;

  const is_threaded = thread_ts !== undefined;
  const is_parent = thread_ts === ts;

  const email_hash = simple_hash(message.user);

  if (is_threaded && !is_parent) {
    // this is a continuation of a thread
    console.info("Reply in a thread");

    // Grab the previous conversation messages
    const replies = await app.client.conversations.replies({
      channel: id,
      ts: thread_ts,
    });

    let prompt = threadReplyTemplate;
    prompt = prompt + promptTemplate;

    replies.messages.map((reply) => {
      if (reply.bot_id) {
        // This message is from Rosie
        prompt = prompt + AIThreadReply + reply.text;
      } else {
        // This message is from the user
        prompt = prompt + userThreadReply + reply.text;
      }
    });

    prompt = prompt + AIThreadReply;
    console.log(`\n\n******\nFINAL PROMPT\n******\n\n`, prompt);

    // const prompt = promptTemplate + message.text + promptAnswer;
    const aiResponse = await getAIResponse(prompt, email_hash);
    const answer = aiResponse.data.choices[0].text.trim();

    replyToReply(
      client,
      message.channel,
      message.thread_ts,
      message.ts,
      answer,
      say
    );
  } else {
    // this is a new thread - standard reply
    console.info("Reply to a new topic");

    /* Query the backend */

    // use localhost dev server
    // const answer = await axios.post(
    //   `${base_url}` + "/api/slackbot/question",
    //   {
    //     email: message.user.id || "unauthenticated",
    //     questionText: message.text,
    //   }
    // );
    // console.log(answer);
    // TODO: fix the connection to samoyed
    
    let prompt = threadReplyTemplate;
    prompt = promptTemplate + message.text + promptAnswer;
    const aiResponse = await getAIResponse(prompt, email_hash);
    const answer = aiResponse.data.choices[0].text.trim();

    replyToParent(client, message.channel, message.ts, answer, say);
  }
});

async function replyToParent(client, id, ts, answer, say) {
  try {
    // Call the chat.postMessage method using the built-in WebClient
    const result = await app.client.chat.postMessage({
      // The token you used to initialize your app
      token: SLACK_BOT_TOKEN,
      channel: id,
      thread_ts: ts,
      text: `${answer}`,
      // You could also use a blocks[] array to send richer content
    });
  } catch (error) {
    console.error(error);
    await say({
      text: `Rosie had an error in replyToParent: ${error}`,
    });
  }
}
async function replyToReply(client, id, thread_ts, ts, answer, say) {
  try {
    // Call the chat.postMessage method using the built-in WebClient
    const result = await app.client.chat.postMessage({
      // The token you used to initialize your app
      token: SLACK_BOT_TOKEN,
      channel: id,
      thread_ts: thread_ts,
      ts: ts,
      text: `${answer}`,
      // You could also use a blocks[] array to send richer content
    });
  } catch (error) {
    console.error(error);
    await say({
      text: `Rosie had an error in replyToReply: ${error}`,
    });
  }
}

async function getAIResponse(prompt, hash) {
  const res = await openai.complete({
    engine: "davinci-plus", // old version was davinci-codex
    prompt: prompt,
    maxTokens: 256,
    temperature: 0.5,
    topP: 1,
    stop: "###",
    user: hash,
  });
  return res;
}

const promptTemplate = `###


User:
How do I navigate programmatically in React?

I know I can create <Link /> objects to click and navigate, but how do I navigate based on a programmatic event happening?

###
AI:
You can use the \`useHistory\` hook to programmatically navigate pages in React. This only works in the new functional React style. 

Here's an example:
\`\`\` JS
import { useHistory } from "react-router-dom";

function HomeButton() {
  const history = useHistory();

  function handleClick() {
    history.push("/home");
  }

  return (
    <button type="button" onClick={handleClick}>
      Go home
    </button>
  );
}
\`\`\`

Here's a link to the official [documentation](https://v5.reactrouter.com/web/api/Hooks/usehistory]

`;

const promptAnswer = `

Answer text:`;

const threadReplyTemplate = `The following is a conversation between a React engineer and a helpful AI pair programmer:`;

const userThreadReply = `
###
User:
`;

const AIThreadReply = `
###
AI:
`;

const simple_hash = (input) => {
  return Array.from(input)
    .reduce((hash, char) => 0 | (31 * hash + char.charCodeAt(0)), 0)
    .toString();
};

(async () => {
  // Start your app
  await app.start();

  !is_dev
    ? console.log("⚡️ Rosie production is running")
    : console.log("⚡️ Rosie-Dev development is running");
  if (!process.env.NODE_ENV) {
    console.error("Unsure what environment we're in");
  }
})();
