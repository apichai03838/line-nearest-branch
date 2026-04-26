const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const CHANNEL_ACCESS_TOKEN = process.env.CHANNEL_ACCESS_TOKEN;

// ====== สาขา (พิกัดจริงของคุณ) ======
const branches = [
  { name: "สาขา 30 กันยา โคราช", lat: 14.9916966, lon: 102.1150255, phone: "0812345671", hours: "08:00 - 18:00" },
  { name: "สาขาหนองปรือ โคราช", lat: 14.928936, lon: 102.104462, phone: "0812345672", hours: "08:00 - 18:00" },
  { name: "สาขาหนองลุมพุก", lat: 15.449482, lon: 101.862531, phone: "0812345673", hours: "08:00 - 18:00" },
  { name: "สาขาหนองฉิม", lat: 15.561264, lon: 101.956739, phone: "0812345674", hours: "08:00 - 18:00" },
  { name: "สาขาหนองบัวแดง", lat: 16.077880, lon: 101.799314, phone: "0812345675", hours: "08:00 - 18:00" },
  { name: "สาขาจัตุรัส แยกไฟแดง", lat: 15.563173, lon: 101.849556, phone: "0812345676", hours: "08:00 - 18:00" },
  { name: "สาขาจัตุรัส สำนักงานใหญ่", lat: 15.567588, lon: 101.848530, phone: "0812345677", hours: "08:00 - 18:00" },
  { name: "สาขาบ้านเขว้า", lat: 15.770060, lon: 101.909227, phone: "0812345678", hours: "08:00 - 18:00" },
  { name: "สาขาบ้านค่าย", lat: 15.685893, lon: 102.010923, phone: "0812345679", hours: "08:00 - 18:00" },
  { name: "สาขาโลตัส ภูเขียว (แพรวพรรณโมบาย)", lat: 16.364112, lon: 102.139374, phone: "0812345670", hours: "08:00 - 18:00" }
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

// ====== State จำอาการที่ลูกค้าเลือก ======
const userState = new Map();

const symptoms = ["จอแตก", "แบตเสื่อม", "กล้องเสีย", "ลำโพงเสีย", "พอร์ตเสีย", "โดนน้ำ", "อื่นๆ"];

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

function buildBranchCarousel(top3, headerText) {
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
          action: { type: "uri", label: "ติดต่อสอบถาม", uri: `tel:${b.phone}` }
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

    // ====== รับข้อความ text ======
    if (event.type === "message" && event.message.type === "text") {
      const text = event.message.text.trim();

      // --- ซ่อมมือถือ → ถามอาการ ---
      if (text.includes("ซ่อมมือถือ") || text.includes("ซ่อม")) {
        userState.set(userId, { flow: "repair", step: "symptom" });
        await replyMessage(event.replyToken, [{
          type: "text",
          text: "อาการเครื่องเป็นอย่างไรครับ? 🔧",
          quickReply: {
            items: symptoms.map(s => ({
              type: "action",
              action: { type: "message", label: s, text: s }
            }))
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

      if (state?.flow === "repair") {
        const symptom = state.symptom;
        userState.delete(userId);
        await replyMessage(event.replyToken, [
          {
            type: "text",
            text: `🔧 อาการ: ${symptom}\nสาขาซ่อมใกล้คุณ 3 อันดับแรก`
          },
          buildBranchCarousel(top3, "🔧 รับซ่อมใกล้คุณ")
        ]);
      } else {
        userState.delete(userId);
        await replyMessage(event.replyToken, [
          buildBranchCarousel(top3, "📍 ใกล้คุณ")
        ]);
      }
    }
  }

  res.sendStatus(200);
});

// ====== Run ======
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on", PORT));
