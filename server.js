const express = require('express');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const typeMap = {
  lead: "leads",
  contact: "contacts",
  company: "companies",
  customer: "customers",
  1: "leads",
  2: "contacts",
  3: "companies",
  12: "customers"
};



app.use(cors());
app.use(express.json());

// === ПАПКА ДЛЯ ФАЙЛОВ (Timeweb разрешает писать только в /tmp) ===
const UPLOAD_DIR = '/tmp/uploads';

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Раздача файлов по URL /uploads/...
app.use('/uploads', express.static(UPLOAD_DIR));

// === Multer ===
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/\s+/g, '_');
    cb(null, `${Date.now()}-${safeName}`);
  }
});

const upload = multer({ storage });

// === Переменные окружения ===
const AMO_SUBDOMAIN= 'standfin'
const AMO_ACCESS_TOKEN= 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsImp0aSI6IjM1MmM0MmFkZDUyMDAzOWIxYWViMWQ5NjIzM2EwZWVkOWNmNmViNzY1ZTIyZmEzZTYwYmY3ZGY3ZDU1MzBiZDUwMzhhOGNlOWZmYjhmNzNjIn0.eyJhdWQiOiJjY2I3NzBhMi05ZTU2LTQyNGEtODgwZS01ZTg3ODk2MmMyMDIiLCJqdGkiOiIzNTJjNDJhZGQ1MjAwMzliMWFlYjFkOTYyMzNhMGVlZDljZjZlYjc2NWUyMmZhM2U2MGJmN2RmN2Q1NTMwYmQ1MDM4YThjZTlmZmI4ZjczYyIsImlhdCI6MTc3MDkxMDU0NiwibmJmIjoxNzcwOTEwNTQ2LCJleHAiOjE4NjQ0MjU2MDAsInN1YiI6IjEzNDI1NDE4IiwiZ3JhbnRfdHlwZSI6IiIsImFjY291bnRfaWQiOjMxODUzODM4LCJiYXNlX2RvbWFpbiI6ImFtb2NybS5ydSIsInZlcnNpb24iOjIsInNjb3BlcyI6WyJjcm0iLCJmaWxlcyIsImZpbGVzX2RlbGV0ZSIsIm5vdGlmaWNhdGlvbnMiLCJwdXNoX25vdGlmaWNhdGlvbnMiXSwiaGFzaF91dWlkIjoiODI1NDRkYzItNDg1OS00YzE5LTg4YTAtODgzNjc3N2E2Y2VkIiwiYXBpX2RvbWFpbiI6ImFwaS1iLmFtb2NybS5ydSJ9.VSw6oIfykg18SdWJSoMLMkX49L16-rgPr6gPH7X1wpbMLoGBT_vLpVqDHhXDMNvGV46nlyPpgGe_O1KkxyE9GS6f2gxEvCTKbz-3W45kXdzxvp3cOSLclcRm0XFww6DIyoCwZpkZ_F8Frw1QNVVJFP6mfKlVLo9CQAtrfgsLOYgTd1WHGwhmjHKJSo0D3GFEPa7l8xIuxqFzxy72kH6E_Zc4JB2BJdHh7hni7VrcPzYP5m0CGVQfkg127szEV_QAK6SNpG44y-QyrAk6N4G8NXZ97m8MCio5rGSNP6o7fdF-HtPv8HYxzS5xRgSA-1FkOXKj13McVDxR_wTFhLVbnQ'

// === Функция отправки записи в amoCRM ===
const createF5CallNote = async (entityId, entityType, params) => {
  const apiType = typeMap[entityType] || "leads";
  const url = `https://${AMO_SUBDOMAIN}.amocrm.ru/api/v4/${apiType}/${entityId}/notes`;



  const payload = [
    {
      note_type: "call_in",
      params
    }
  ];

  console.log("Отправляем в amoCRM:", JSON.stringify(payload, null, 2));

  return axios.post(url, payload, {
    headers: {
      Authorization: `Bearer ${AMO_ACCESS_TOKEN}`,
      "Content-Type": "application/json"
    }
  });
};

// === API загрузки ===
app.post('/api/upload', upload.single('audio'), async (req, res) => {
  try {
    const file = req.file;
    const { entity_id, entity_type, duration, phone } = req.body;

    if (!file) {
      return res.status(400).json({ error: 'Файл не загружен' });
    }
    if (!entity_id) {
      return res.status(400).json({ error: 'Не указан entity_id' });
    }

    // Формируем ссылку на файл
    const host = req.get('host');
    const fileUrl = `https://${host}/uploads/${file.filename}`;


    console.log("Файл сохранён:", fileUrl);

    const noteParams = {
      uniq: `offline_${Date.now()}_${Math.random()}`,
      duration: parseInt(duration) || 0,
      source: 'Диктофон (Офлайн)',
      link: fileUrl,
      phone: phone || ''
    };

    try {
      const amoResponse = await createF5CallNote(
        entity_id,
        entity_type || 'leads',
        noteParams
      );

      console.log("Ответ amoCRM:", amoResponse.status);

      res.json({
        success: true,
        message: "Запись сохранена и отправлена в F5",
        url: fileUrl
      });

    } catch (amoError) {
      console.error("Ошибка amoCRM:", amoError.response?.data || amoError.message);

      res.status(500).json({
        error: "Файл сохранён, но ошибка при отправке в amoCRM",
        details: amoError.response?.data
      });
    }

  } catch (error) {
    console.error("Ошибка сервера:", error);
    res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
});

// === Запуск ===
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
});
