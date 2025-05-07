const express = require('express');
const fs = require('fs');
const app = express();
const PORT = 3000;

app.get('/kullanicilar', (req, res) => {
  try {
    const data = fs.readFileSync('tum_kullanicilar.json', 'utf-8');
    const json = JSON.parse(data);
    res.json(json);
  } catch (err) {
    res.status(500).json({ error: 'Veri okunamadı.' });
  }
});

app.listen(PORT, () => {
  console.log(`📡 API http://localhost:${PORT} adresinde yayında`);
});
