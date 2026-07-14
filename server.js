require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();

// Necessário no Railway/Heroku pra rate-limit identificar o IP real do usuário
app.set('trust proxy', 1);

app.use(helmet());
app.use(express.json());

// ====== CORS restrito ======
// Só o domínio da sua landing pode chamar essa API.
// Configure FRONTEND_URL no .env (ex: https://idistopic.com)
const allowedOrigin = process.env.FRONTEND_URL;
app.use(cors({
  origin: allowedOrigin || '*', // fallback '*' só serve pra dev local, nunca em produção
}));

// ====== Rate limit ======
// Máximo de 5 inscrições por IP a cada 10 minutos — evita spam/bot no formulário
const subscribeLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  message: { message: 'Muitas tentativas. Tenta novamente em alguns minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ====== Conexão com MongoDB ======
// Coloca a tua connection string no .env (variável MONGO_URI)
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB conectado'))
  .catch((err) => console.error('Erro ao conectar MongoDB:', err.message));

// ====== Schema ======
const subscriberSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  createdAt: { type: Date, default: Date.now },
  source: { type: String, default: 'landing' },
});

const Subscriber = mongoose.model('Subscriber', subscriberSchema);

// ====== Rotas ======

// Health check — útil pro Railway saber se o serviço está de pé
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

// Inscrever e-mail
app.post('/subscribe', subscribeLimiter, async (req, res) => {
  try {
    const { email, source } = req.body;

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ message: 'E-mail inválido' });
    }

    const subscriber = await Subscriber.create({ email, source });
    return res.status(201).json({ message: 'Inscrito com sucesso', id: subscriber._id });

  } catch (err) {
    // Erro de duplicado (índice unique do email)
    if (err.code === 11000) {
      return res.status(409).json({ message: 'Esse e-mail já está cadastrado' });
    }
    console.error(err);
    return res.status(500).json({ message: 'Erro no servidor' });
  }
});

// Listar inscritos — protegido por chave simples (não é pra ser público)
app.get('/subscribers', async (req, res) => {
  const key = req.headers['x-admin-key'];
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ message: 'Não autorizado' });
  }
  try {
    const subscribers = await Subscriber.find().sort({ createdAt: -1 });
    res.json({ count: subscribers.length, subscribers });
  } catch (err) {
    res.status(500).json({ message: 'Erro no servidor' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
