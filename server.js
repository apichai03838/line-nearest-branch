const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const CHANNEL_ACCESS_TOKEN = process.env.CHANNEL_ACCESS_TOKEN;

// ====== สาขา (พิกัดจริงของคุณ) ======
const branches = [
  { name: "สาขา 30 กันยา โคราช", lat: 14.9916966, lon: 102.1150255 },
  { name: "สาขาหนองปรือ โคราช", lat: 14.928936, lon: 102.104462 },
  { name: "สาขาหนองลุมพุก", lat: 15.449482, lon: 101.862531 },
  { name: "สาขาหนองฉิม", lat: 15.561264, lon: 101.956739 },
  { name: "สาขาหนองบัวแดง", lat: 16.077880, lon: 101.799314 },
  { name: "สาขาจัตุรัส แยกไฟแดง", lat: 15.563173, lon: 101.849556 },
  { name: "สาขาจัตุรัส สำนักงานใหญ่", lat: 15.567588, lon: 101.848530 },
  { name: "สาขาบ้านเขว้า", lat: 15.770060, lon: 101.909227 },
  { name: "สาขาบ้านค่าย", lat: 15.685893, lon: 102.010923 },
  { name: "สาขาโลตัส ภูเขียว (แพรวพรรณโมบาย)", lat: 16.364112, lon: 102.139374 }
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

// ====== Webhook ======
app.post("/webhook", async (req, res) => {
  const events = req.body.events || [];

  for (const event of events) {
    // ====== รับข้อความ text → ขอพิกัด ======
    if (event.type === "message" && event.message.type === "text") {
      const text = event.message.text.trim().toLowerCase();
      if (text.includes("location") || text.includes("สาขา") || text.includes("📍")) {
        await axios.post(
          "https://api.line.me/v2/bot/message/reply",
          {
            replyToken: event.replyToken,
            messages: [{
              type: "text",
              text: "กรุณาแชร์ตำแหน่งของคุณ เพื่อค้นหาสาขาใกล้เคียง 📍",
              quickReply: {
                items: [{
                  type: "action",
                  action: {
                    type: "location",
                    label: "แชร์ตำแหน่งของฉัน"
                  }
                }]
              }
            }]
          },
          {
            headers: {
              Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`,
              "Content-Type": "application/json"
            }
          }
        );
      }
    }

    if (event.type === "message" && event.message.type === "location") {
      const userLat = event.message.latitude;
      const userLon = event.message.longitude;

      // คำนวณ + เรียง
      const sorted = branches.map(b => ({
        ...b,
        distance: getDistance(userLat, userLon, b.lat, b.lon)
      })).sort((a, b) => a.distance - b.distance);

      const top3 = sorted.slice(0, 3);

      const bubbles = top3.map(b => ({
        type: "bubble",
        body: {
          type: "box",
          layout: "vertical",
          contents: [
            { type: "text", text: "📍 ใกล้คุณ", size: "sm", color: "#888888" },
            { type: "text", text: b.name, weight: "bold", size: "md", wrap: true },
            { type: "text", text: `ระยะ ${b.distance.toFixed(2)} กม.`, size: "sm", color: "#888888" }
          ]
        },
        footer: {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "button",
              style: "primary",
              color: "#FFC83D",
              action: {
                type: "uri",
                label: "นำทาง",
                uri: mapLink(b.lat, b.lon)
              }
            }
          ]
        }
      }));

      await axios.post(
        "https://api.line.me/v2/bot/message/reply",
        {
          replyToken: event.replyToken,
          messages: [{
            type: "flex",
            altText: "สาขาใกล้คุณ",
            contents: { type: "carousel", contents: bubbles }
          }]
        },
        {
          headers: {
            Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`,
            "Content-Type": "application/json"
          }
        }
      );
    }
  }

  res.sendStatus(200);
});

// ====== Run ======
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on", PORT));
