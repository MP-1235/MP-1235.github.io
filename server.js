// server.js - Express + multer: guarda cada subida en uploads/<uuid>/ y crea una página pública en /games/:id
// Requisitos: Node 16+
// Instalar dependencias: npm install express multer
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const app = express();

// Sirve index.html y assets desde la raíz del proyecto
app.use(express.static(path.join(__dirname)));

// Generar un ID antes de procesar multipart (middleware)
function genUploadId(req, res, next){
  req.uploadId = crypto.randomUUID();
  next();
}

// Configuración de almacenamiento dinámico: cada archivo va a uploads/<id>/
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const id = req.uploadId || 'unknown';
    const dir = path.join(__dirname, 'uploads', id);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    // Mantener parte del nombre original, pero hacerlo seguro
    const safeName = Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    cb(null, safeName);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 1024 * 1024 * 1024 } // 1 GB límite (ajusta si quieres)
});

// Endpoint para recibir logo + zip + descripción
const cpUpload = upload.fields([{ name: 'logo', maxCount: 1 }, { name: 'zipfile', maxCount: 1 }]);
app.post('/upload', genUploadId, cpUpload, (req, res) => {
  try {
    const id = req.uploadId;
    const dir = path.join(__dirname, 'uploads', id);
    const description = (req.body.description || '').toString().slice(0, 2000); // limita tamaño metadata

    const files = req.files || {};
    const logoFile = files.logo && files.logo[0] ? files.logo[0].filename : null;
    const zipFile = files.zipfile && files.zipfile[0] ? files.zipfile[0].filename : null;

    const meta = {
      id,
      description,
      files: {
        logo: logoFile,
        zip: zipFile
      },
      createdAt: new Date().toISOString()
    };

    fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');

    const url = `${req.protocol}://${req.get('host')}/games/${id}`;
    res.json({ ok: true, id, url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Servir archivos subidos de forma estática: /uploads/<id>/<file>
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Página pública para cada juego: /games/:id
app.get('/games/:id', (req, res) => {
  const id = req.params.id;
  const dir = path.join(__dirname, 'uploads', id);
  const metaPath = path.join(dir, 'meta.json');
  if(!fs.existsSync(metaPath)){
    return res.status(404).send('<h1>No encontrado</h1><p>ID no encontrado o eliminado.</p>');
  }
  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    const logo = meta.files.logo ? `/uploads/${id}/${meta.files.logo}` : null;
    const zip = meta.files.zip ? `/uploads/${id}/${meta.files.zip}` : null;
    // Generar HTML público sencillo
    const page = `
      <!doctype html>
      <html lang="es">
      <head>
        <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
        <title>Juego compartido — ${id}</title>
        <style>
          body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;margin:24px;background:#f7fafc;color:#0b1220}
          .card{max-width:900px;margin:0 auto;background:#fff;padding:20px;border-radius:12px;box-shadow:0 8px 30px rgba(2,6,23,0.06)}
          .logo{width:160px;height:160px;border-radius:12px;border:1px solid #e6edf6;display:flex;align-items:center;justify-content:center;overflow:hidden}
          img{max-width:100%;max-height:100%;object-fit:contain}
          h1{margin:0 0 8px 0}
          p{color:#374151}
          .download{display:inline-block;padding:10px 14px;background:#059669;color:white;border-radius:10px;text-decoration:none;font-weight:600;margin-top:12px}
        </style>
      </head>
      <body>
        <div class="card">
          <div style="display:flex;gap:20px;align-items:center">
            <div class="logo">${logo ? `<img src="${logo}" alt="Logo">` : '<div style="color:#9ca3af">Sin logo</div>'}</div>
            <div>
              <h1>Juego compartido</h1>
              <p>${meta.description ? escapeHtml(meta.description).replace(/\n/g,'<br>') : '<i>Sin descripción</i>'}</p>
              ${zip ? `<a class="download" href="${zip}" download>Descargar .zip</a>` : '<div style="color:#9ca3af">No hay archivo .zip disponible</div>'}
            </div>
          </div>
          <hr style="margin:18px 0">
          <small>Enlace público: <a href="${req.protocol}://${req.get('host')}/games/${id}">${req.protocol}://${req.get('host')}/games/${id}</a></small>
        </div>
      </body>
      </html>
    `;
    res.send(page);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error interno');
  }
});

// Helper para escapar HTML básico
function escapeHtml(str){
  return (str || '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[ch]);
}

app.listen(PORT, () => console.log(`Servidor escuchando en http://localhost:${PORT}`));
