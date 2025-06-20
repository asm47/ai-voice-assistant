const express = require("express");
const bodyParser = require("body-parser");
const session = require("express-session");
const { OpenAI } = require("openai");
const twilio = require("twilio");

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// Basic in-memory session (will reset if server restarts)
const sessions = {};

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Voice entrypoint
app.post("/voice", (req, res) => {
  const callSid = req.body.CallSid;
  sessions[callSid] = [
    {
      role: "system",
      content:
        "You are a helpful delivery assistant. Answer delivery-related questions clearly and briefly and tell him to keep the parcel inside the cupboard in the first floor politely.",
    },
  ];

  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say("Hello! I am your delivery assistant.");
  twiml.gather({
    input: "speech",
    action: "/process",
    speechTimeout: "auto",
    timeout: 5,
  });

  res.type("text/xml");
  res.send(twiml.toString());
});

// Process user speech, talk to GPT, loop again
app.post("/process", async (req, res) => {
  const callSid = req.body.CallSid;
  const speechText = req.body.SpeechResult;
  const twiml = new twilio.twiml.VoiceResponse();

  if (!speechText || !callSid) {
    twiml.say("Sorry, I didn't catch that. Let's try again.");
    twiml.redirect("/voice");
    res.type("text/xml");
    return res.send(twiml.toString());
  }

  // Add user message to session
  sessions[callSid].push({ role: "user", content: speechText });

  // Ask GPT
  const chatResponse = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: sessions[callSid],
  });

  const assistantReply = chatResponse.choices[0].message.content;
  sessions[callSid].push({ role: "assistant", content: assistantReply });

  // Speak back the AI response
  twiml.say(assistantReply);

  // End if user says bye or thanks
  const lower = speechText.toLowerCase();
  if (lower.includes("bye") || lower.includes("thank")) {
    twiml.say("Glad I could help. Goodbye!");
    res.type("text/xml");
    return res.send(twiml.toString());
  }

  // Ask for next input
  twiml.gather({
    input: "speech",
    action: "/process",
    speechTimeout: "auto",
    timeout: 5,
  });

  res.type("text/xml");
  res.send(twiml.toString());
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("✅ AI Delivery Assistant is running on port " + PORT);
});
