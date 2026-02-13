const express = require('express');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// 1. Делаем папку доступной для скачивания (чтобы F5 мог забрать файл)
app.use('/uploads', express.static('uploads'));

// 2. Создаем папку uploads, если её нет
if (!fs.existsSync('./uploads')) {
  fs.mkdirSync('./uploads');
}

// 3. Настройка сохранения файлов (Multer)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, './uploads'),
  filename: (req, file, cb) => {
    // Имя файла: timestamp-оригинальное_имя.mp3
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});
const upload = multer({ storage: storage });

const AMO_SUBDOMAIN = process.env.AMO_SUBDOMAIN;
const ACCESS_TOKEN = process.env.AMO_ACCESS_TOKEN;

// --- ГЛАВНАЯ ФУНКЦИЯ ДЛЯ F5 ---
const createF5CallNote = async (entityId, entityType, params) => {
  const url = `https://${AMO_SUBDOMAIN}.amocrm.ru/api/v4/${entityType}/${entityId}/notes`;
  
  const payload = [
    {
      "note_type": "call_in",
      "params": params
    }
  ];

  console.log(`Отправляем в amoCRM (ID: ${entityId}):`, JSON.stringify(payload, null, 2));

  return axios.post(url, payload, {
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });
};

// --- API ДЛЯ ЗАГРУЗКИ ---
app.post('/api/upload', upload.single('audio'), async (req, res) => {
  try {
    const file = req.file;
    // Получаем данные из Postman или Виджета
    const { entity_id, entity_type, duration, phone } = req.body;

    if (!file) {
      return res.status(400).json({ error: 'Файл не загружен' });
    }
    if (!entity_id) {
      return res.status(400).json({ error: 'Не указан entity_id (ID сделки)' });
    }

    // Формируем ссылку на файл (http://localhost:3000/uploads/...)
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.get('host');
    const fileUrl = `${protocol}://${host}/uploads/${file.filename}`;

    console.log('Файл сохранен локально:', fileUrl);

    // Параметры звонка для F5
    const noteParams = {
      uniq: `offline_${Date.now()}_${Math.random()}`,
      duration: parseInt(duration) || 0,
      source: 'Диктофон (Офлайн)',
      link: fileUrl,
      phone: phone || ''
    };

    // Отправляем запрос в амо
    try {
      const amoResponse = await createF5CallNote(entity_id, entity_type || 'leads', noteParams);
      console.log('Ответ от amoCRM:', amoResponse.status);
      
      res.json({ 
        success: true, 
        message: 'Запись сохранена и отправлена в F5',
        url: fileUrl 
      });

    } catch (amoError) {
      console.error('Ошибка amoCRM:', amoError.response?.data || amoError.message);
      res.status(500).json({ 
        error: 'Файл сохранен, но ошибка при отправке в амо', 
        details: amoError.response?.data 
      });
    }

  } catch (error) {
    console.error('!!! ОШИБКА ОТ AMOCRM !!!');
    console.dir(amoError.response?.data, { depth: null, colors: true });
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
});

// Запуск
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен! Адрес: http://localhost:${PORT}`);
});
