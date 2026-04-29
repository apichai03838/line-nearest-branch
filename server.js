const express = require("express");
const axios = require("axios");
const { google } = require("googleapis");

const app = express();
app.use(express.json());

const CHANNEL_ACCESS_TOKEN = process.env.CHANNEL_ACCESS_TOKEN;
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

async function appendToSheet(row) {
  try {
    const auth = new google.auth.JWT({
      email: GOOGLE_CLIENT_EMAIL,
      key: GOOGLE_PRIVATE_KEY,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"]
    });
    const sheets = google.sheets({ version: "v4", auth });
    await sheets.spreadsheets.values.append({
      spreadsheetId: GOOGLE_SHEET_ID,
      range: "A:I",
      valueInputOption: "USER_ENTERED",
      resource: { values: [row] }
    });
  } catch (e) {
    console.error("[SHEETS ERROR]", e.message);
  }
}

// ====== สาขา (พิกัดจริงของคุณ) ======
const branches = [
  { name: "สาขา 30 กันยา โคราช", lat: 14.9916966, lon: 102.1150255, phone: "0826572329", hours: "08:00 - 20:00 น.", groupId: "Caa030cc7ec62663c8ea69ce3f5affac9" },
  { name: "สาขาหนองปรือ โคราช", lat: 14.928936, lon: 102.104462, phone: "0930762869", hours: "08:00 - 20:00 น.", groupId: "Cb62cae9ab1cb1b3526b20e37e15ab51e" },
  { name: "สาขาหนองลุมพุก", lat: 15.449482, lon: 101.862531, phone: "0989984544", hours: "08:00 - 20:00 น.", groupId: null },
  { name: "สาขาหนองฉิม", lat: 15.561264, lon: 101.956739, phone: "0983137020", hours: "08:00 - 20:00 น.", groupId: null },
  { name: "สาขาหนองบัวแดง", lat: 16.077880, lon: 101.799314, phone: "0987079518", hours: "08:00 - 20:00 น.", groupId: null },
  { name: "สาขาจัตุรัส แยกไฟแดง", lat: 15.563173, lon: 101.849556, phone: "0621365519", hours: "08:00 - 20:00 น.", groupId: null },
  { name: "สาขาจัตุรัส สำนักงานใหญ่", lat: 15.567588, lon: 101.848530, phone: "0621365528", hours: "08:00 - 20:00 น.", groupId: null },
  { name: "สาขาบ้านเขว้า", lat: 15.770060, lon: 101.909227, phone: "0997343752", hours: "08:00 - 20:00 น.", groupId: null },
  { name: "สาขาบ้านค่าย", lat: 15.685893, lon: 102.010923, phone: "0929137119", hours: "08:00 - 20:00 น.", groupId: null },
  { name: "สาขาโลตัส ภูเขียว (แพรวพรรณโมบาย)", lat: 16.364112, lon: 102.139374, phone: "0985973980", hours: "08:00 - 20:00 น.", groupId: null }
];

// ====== คำนวณระยะ (km) ======
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;

  const a =
    Math.sin(dLat/2) ** 2 +
    Math.cos(lat1*Math.PI/180) *
    Math.cos(lat2*Math.PI/180) *
    Math.sin(dLon/2) ** 2;

  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

function mapLink(lat, lon) {
  return `https://www.google.com/maps?q=${lat},${lon}`;
}

// ====== กลุ่ม LINE รวมพนักงาน ======
const STAFF_GROUP_ID = "Cb62cae9ab1cb1b3526b20e37e15ab51e";

// ====== State จำอาการที่ลูกค้าเลือก ======
const userState = new Map();

const symptoms = ["จอแตก", "แบตเสื่อม", "กล้องเสีย", "ลำโพงเสีย", "เครื่องดับ", "อื่นๆ"];
const inquiryTopics = ["สอบถามราคา", "สอบถามผ่อน", "เช็คสินค้าในสต็อก", "สาขาใกล้ฉัน", "รายละเอียดการสะสมแต้มและสแตมป์", "อื่นๆ"];

async function pushNotify(text) {
  await axios.post(
    "https://api.line.me/v2/bot/message/push",
    {
      to: STAFF_GROUP_ID,
      messages: [{ type: "text", text }]
    },
    {
      headers: {
        Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );
}

async function pushNotifyBranch(branch, topic, distance) {
  await pushNotify(
    `─────────\n💬 ลูกค้าติดต่อเข้ามาใหม่!\n─────────\n📋 หัวข้อ: ${topic}\n📍 ${branch.name}\n📏 ระยะ ${distance} กม.\n─────────\n👉 รีบเข้าไปตอบได้เลยค่ะ`
  );
}

async function pushNotifyRepair(branch, symptom, distance) {
  await pushNotify(
    `─────────\n🔔 แจ้งซ่อมเข้ามาใหม่!\n─────────\n🔧 อาการ: ${symptom}\n📍 ${branch.name}\n📏 ระยะ ${distance} กม.\n─────────\n👉 รีบเข้าไปตอบได้เลยค่ะ`
  );
}

async function replyMessage(replyToken, messages) {
  await axios.post(
    "https://api.line.me/v2/bot/message/reply",
    { replyToken, messages },
    {
      headers: {
        Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );
}

function buildBranchCarousel(top3, headerText, phoneLabel = "ติดต่อสอบถาม") {
  const bubbles = top3.map(b => ({
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      contents: [
        { type: "text", text: headerText, size: "sm", color: "#888888" },
        { type: "text", text: b.name, weight: "bold", size: "md", wrap: true },
        { type: "text", text: `ระยะ ${b.distance.toFixed(2)} กม.`, size: "sm", color: "#888888", margin: "sm" },
        { type: "text", text: `🕐 ${b.hours}`, size: "sm", color: "#888888", margin: "sm" },
        { type: "text", text: `📞 ${b.phone}`, size: "sm", color: "#888888", margin: "sm" }
      ]
    },
    footer: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        {
          type: "button",
          style: "primary",
          color: "#FFC83D",
          action: { type: "uri", label: "นำทาง", uri: mapLink(b.lat, b.lon) }
        },
        {
          type: "button",
          style: "primary",
          color: "#27AE60",
          action: { type: "uri", label: phoneLabel, uri: `tel:${b.phone}` }
        }
      ]
    }
  }));

  return {
    type: "flex",
    altText: "สาขาใกล้คุณ",
    contents: { type: "carousel", contents: bubbles }
  };
}

// ====== Webhook ======
app.post("/webhook", async (req, res) => {
  const events = req.body.events || [];

  for (const event of events) {
    const userId = event.source?.userId;

    // ====== log groupId + ไม่ตอบในกลุ่ม ======
    if (event.source?.type === "group") {
      console.log(`[GROUP ID] ${event.source.groupId}`);
      continue;
    }

    // ====== รับข้อความ text ======
    if (event.type === "message" && event.message.type === "text") {
      const text = event.message.text.trim();

      // --- ติดต่อสอบถาม → ถามหัวข้อ (Flex Menu) ---
      if (text.includes("ติดต่อสอบถาม") || text.includes("ติดต่อ")) {
        userState.set(userId, { flow: "inquiry", step: "topic" });

        const soloTopics = ["รายละเอียดการสะสมแต้มและสแตมป์", "อื่นๆ"];
        const pairTopics = inquiryTopics.filter(t => !soloTopics.includes(t));
        const rows = [];
        for (let i = 0; i < pairTopics.length; i += 2) {
          rows.push({
            type: "box", layout: "horizontal", spacing: "sm",
            contents: pairTopics.slice(i, i + 2).map(t => ({
              type: "button", style: "primary", color: "#FFC83D",
              action: { type: "message", label: t, text: t }, flex: 1
            }))
          });
        }
        for (const t of soloTopics) {
          rows.push({
            type: "box", layout: "horizontal", spacing: "sm",
            contents: [{
              type: "button", style: "primary", color: "#FFC83D",
              action: { type: "message", label: t, text: t }, flex: 1
            }]
          });
        }

        await replyMessage(event.replyToken, [{
          type: "flex",
          altText: "เลือกหัวข้อสอบถาม",
          contents: {
            type: "bubble",
            body: {
              type: "box",
              layout: "vertical",
              spacing: "sm",
              contents: [
                { type: "text", text: "💬 ต้องการสอบถามเรื่องอะไรครับ?", weight: "bold", size: "md", wrap: true },
                { type: "separator", margin: "sm" },
                ...rows
              ]
            }
          }
        }]);
        continue;
      }

      // --- เลือกหัวข้อแล้ว → ขอพิกัด ---
      if (inquiryTopics.includes(text) && userState.get(userId)?.step === "topic") {
        userState.set(userId, { flow: "inquiry", step: "location", topic: text });
        await replyMessage(event.replyToken, [{
          type: "text",
          text: `รับทราบครับ หัวข้อ: ${text} 📋\nกรุณาแชร์ตำแหน่งของคุณ เพื่อให้ทีมงานสาขาใกล้คุณติดต่อกลับ 📍`,
          quickReply: {
            items: [{
              type: "action",
              action: { type: "location", label: "แชร์ตำแหน่งของฉัน" }
            }]
          }
        }]);
        continue;
      }

      // --- ซ่อมมือถือ → ถามอาการ (Flex Menu) ---
      if (text.includes("ซ่อมมือถือ") || text.includes("ซ่อม")) {
        userState.set(userId, { flow: "repair", step: "symptom" });

        // แบ่งปุ่มเป็นแถวๆ ละ 2 ปุ่ม
        const rows = [];
        for (let i = 0; i < symptoms.length; i += 2) {
          rows.push({
            type: "box",
            layout: "horizontal",
            spacing: "sm",
            contents: symptoms.slice(i, i + 2).map(s => ({
              type: "button",
              style: "primary",
              color: "#FFC83D",
              action: { type: "message", label: s, text: s },
              flex: 1
            }))
          });
        }

        await replyMessage(event.replyToken, [{
          type: "flex",
          altText: "เลือกอาการเครื่อง",
          contents: {
            type: "bubble",
            body: {
              type: "box",
              layout: "vertical",
              spacing: "sm",
              contents: [
                { type: "text", text: "🔧 อาการเครื่องเป็นอย่างไร?", weight: "bold", size: "md", wrap: true },
                { type: "separator", margin: "sm" },
                ...rows
              ]
            }
          }
        }]);
        continue;
      }

      // --- เลือกอาการแล้ว → ขอพิกัด ---
      if (symptoms.includes(text) && userState.get(userId)?.step === "symptom") {
        userState.set(userId, { flow: "repair", step: "location", symptom: text });
        await replyMessage(event.replyToken, [{
          type: "text",
          text: `รับทราบครับ อาการ: ${text} 📋\nกรุณาแชร์ตำแหน่งของคุณ เพื่อค้นหาสาขาซ่อมใกล้เคียง 📍`,
          quickReply: {
            items: [{
              type: "action",
              action: { type: "location", label: "แชร์ตำแหน่งของฉัน" }
            }]
          }
        }]);
        continue;
      }

      // --- หาสาขาทั่วไป ---
      if (text.toLowerCase().includes("location") || text.includes("สาขา") || text.includes("📍")) {
        userState.set(userId, { flow: "branch", step: "location" });
        await replyMessage(event.replyToken, [{
          type: "text",
          text: "กรุณาแชร์ตำแหน่งของคุณ เพื่อค้นหาสาขาใกล้เคียง 📍",
          quickReply: {
            items: [{
              type: "action",
              action: { type: "location", label: "แชร์ตำแหน่งของฉัน" }
            }]
          }
        }]);
        continue;
      }
    }

    if (event.type === "message" && event.message.type === "location") {
      const userLat = event.message.latitude;
      const userLon = event.message.longitude;
      const state = userState.get(userId);

      const sorted = branches.map(b => ({
        ...b,
        distance: getDistance(userLat, userLon, b.lat, b.lon)
      })).sort((a, b) => a.distance - b.distance);

      const top3 = sorted.slice(0, 3);

      const now = new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
      const mapsLink = `https://www.google.com/maps?q=${userLat},${userLon}`;

      if (state?.flow === "repair") {
        const symptom = state.symptom;
        userState.delete(userId);
        await replyMessage(event.replyToken, [
          {
            type: "text",
            text: `🔧 อาการ: ${symptom}\nสาขาซ่อมใกล้คุณ 3 อันดับแรก`
          },
          buildBranchCarousel(top3, "🔧 รับซ่อมใกล้คุณ", "ติดต่อสอบถาม")
        ]);
        try {
          await pushNotifyRepair(top3[0], symptom, top3[0].distance.toFixed(2));
        } catch (e) {
          console.error("[PUSH ERROR]", e.response?.data || e.message);
        }
        await appendToSheet([now, userId, userLat, userLon, mapsLink, "ซ่อมมือถือ", symptom, top3[0].name, top3[0].distance.toFixed(2)]);
      } else if (state?.flow === "inquiry" && state.topic === "รายละเอียดการสะสมแต้มและสแตมป์") {
        userState.delete(userId);
        await replyMessage(event.replyToken, [{
          type: "flex",
          altText: "รายละเอียดการสะสมแต้มและสแตมป์",
          contents: {
            type: "bubble",
            header: {
              type: "box",
              layout: "vertical",
              backgroundColor: "#FFC83D",
              contents: [
                { type: "text", text: "⭐ สะสมแต้ม & สแตมป์", weight: "bold", size: "lg", color: "#ffffff" }
              ]
            },
            body: {
              type: "box",
              layout: "vertical",
              spacing: "md",
              contents: [
                { type: "text", text: "📌 เงื่อนไขการสะสมแต้ม", weight: "bold", size: "sm" },
                { type: "text", text: "• ซื้อสินค้าครบ 100 บาท รับ 1 แต้ม\n• สะสมครบ 50 แต้ม รับส่วนลด 100 บาท\n• แต้มมีอายุ 1 ปีนับจากวันที่รับ", wrap: true, size: "sm", color: "#555555" },
                { type: "separator", margin: "md" },
                { type: "text", text: "📌 เงื่อนไขสแตมป์", weight: "bold", size: "sm", margin: "md" },
                { type: "text", text: "• ซ่อมมือถือ 1 ครั้ง รับ 1 สแตมป์\n• สะสมครบ 5 สแตมป์ รับซ่อมฟรี 1 รายการ\n• สแตมป์ไม่มีวันหมดอายุ", wrap: true, size: "sm", color: "#555555" },
                { type: "separator", margin: "md" },
                { type: "text", text: "⚠️ ข้อมูลนี้เป็นตัวอย่างเท่านั้น\nโปรดติดต่อสาขาเพื่อข้อมูลที่ถูกต้อง", wrap: true, size: "xs", color: "#aaaaaa", margin: "md" }
              ]
            }
          }
        }]);
        await appendToSheet([now, userId, userLat, userLon, mapsLink, "ติดต่อสอบถาม", "รายละเอียดการสะสมแต้มและสแตมป์", top3[0].name, top3[0].distance.toFixed(2)]);
      } else if (state?.flow === "inquiry") {
        const topic = state.topic;
        userState.delete(userId);
        await replyMessage(event.replyToken, [
          {
            type: "text",
            text: `สาขาใกล้คุณ 3 อันดับแรก\nโทรหาเราได้เลย 📞`
          },
          buildBranchCarousel(top3, "💬 ใกล้คุณ", "โทรหาเราเลย")
        ]);
        if (topic !== "สาขาใกล้ฉัน") {
          try {
            await pushNotifyBranch(top3[0], topic, top3[0].distance.toFixed(2));
          } catch (e) {
            console.error("[PUSH ERROR]", e.response?.data || e.message);
          }
        }
        await appendToSheet([now, userId, userLat, userLon, mapsLink, "ติดต่อสอบถาม", topic, top3[0].name, top3[0].distance.toFixed(2)]);
      } else {
        userState.delete(userId);
        await replyMessage(event.replyToken, [
          buildBranchCarousel(top3, "📍 ใกล้คุณ")
        ]);
        await appendToSheet([now, userId, userLat, userLon, mapsLink, "หาสาขา", "-", top3[0].name, top3[0].distance.toFixed(2)]);
      }
    }
  }

  res.sendStatus(200);
});

// ====== Run ======
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on", PORT));
