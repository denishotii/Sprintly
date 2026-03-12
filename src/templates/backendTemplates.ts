/**
 * Backend Templates for Full-Stack Applications
 *
 * Provides templates for:
 * - Express.js server setup
 * - Prisma database schema
 * - Environment configuration
 * - Docker Compose setup
 * - API route templates
 */

// ── Express Server Template ──────────────────────────────────────

export function getExpressServerTemplate(projectName: string): string {
  return `import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Import routes
import healthRoutes from './routes/health.js';
import dataRoutes from './routes/data.js';

// Use routes
app.use('/api/health', healthRoutes);
app.use('/api/data', dataRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  });
});

// Start server
app.listen(PORT, () => {
  console.log(\`✓ Server running on http://localhost:\${PORT}\`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down...');
  await prisma.$disconnect();
  process.exit(0);
});`;
}

// ── Prisma Schema Template ───────────────────────────────────────

export function getPrismaSchemaTemplate(appType: string): string {
  // Different schemas based on app type (e-commerce, dashboard, social, CMS, etc.)
  const schemas = {
    ecommerce: `
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

// Users
model User {
  id        Int     @id @default(autoincrement())
  email     String  @unique
  password  String
  name      String
  role      String  @default("customer")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  orders    Order[]
  reviews   Review[]
}

// Products
model Product {
  id          Int     @id @default(autoincrement())
  sku         String  @unique
  name        String
  description String?
  price       Float
  stock       Int
  category    String
  imageUrl    String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  orderItems OrderItem[]
  reviews    Review[]
}

// Orders
model Order {
  id        Int     @id @default(autoincrement())
  userId    Int
  user      User    @relation(fields: [userId], references: [id])
  status    String  @default("pending")
  total     Float
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  items OrderItem[]
}

model OrderItem {
  id        Int     @id @default(autoincrement())
  orderId   Int
  order     Order   @relation(fields: [orderId], references: [id])
  productId Int
  product   Product @relation(fields: [productId], references: [id])
  quantity  Int
  unitPrice Float
}

// Reviews
model Review {
  id        Int     @id @default(autoincrement())
  userId    Int
  user      User    @relation(fields: [userId], references: [id])
  productId Int
  product   Product @relation(fields: [productId], references: [id])
  rating    Int
  comment   String?
  createdAt DateTime @default(now())
}`,

    dashboard: `
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

// Users
model User {
  id        Int     @id @default(autoincrement())
  email     String  @unique
  password  String
  name      String
  role      String  @default("viewer")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  dashboards Dashboard[]
  metrics    Metric[]
}

// Dashboards
model Dashboard {
  id        Int     @id @default(autoincrement())
  userId    Int
  user      User    @relation(fields: [userId], references: [id])
  title     String
  description String?
  isPublic  Boolean @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  widgets Widget[]
}

// Widgets (chart, metric, table)
model Widget {
  id          Int     @id @default(autoincrement())
  dashboardId Int
  dashboard   Dashboard @relation(fields: [dashboardId], references: [id])
  type        String  // "chart", "metric", "table", "gauge"
  title       String
  dataKey     String
  position    Int
  createdAt   DateTime @default(now())

  metrics Metric[]
}

// Metrics data
model Metric {
  id        Int     @id @default(autoincrement())
  userId    Int
  user      User    @relation(fields: [userId], references: [id])
  widgetId  Int
  widget    Widget  @relation(fields: [widgetId], references: [id])
  key       String
  value     Float
  timestamp DateTime @default(now())
}`,

    social: `
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

// Users
model User {
  id        Int     @id @default(autoincrement())
  email     String  @unique
  username  String  @unique
  password  String
  bio       String?
  avatarUrl String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  posts       Post[]
  comments    Comment[]
  likes       Like[]
  followers   Follow[] @relation("follower")
  following   Follow[] @relation("following")
  messages    Message[]
}

// Posts
model Post {
  id        Int     @id @default(autoincrement())
  userId    Int
  user      User    @relation(fields: [userId], references: [id])
  content   String
  imageUrl  String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  comments Comment[]
  likes    Like[]
}

// Comments
model Comment {
  id        Int     @id @default(autoincrement())
  postId    Int
  post      Post    @relation(fields: [postId], references: [id])
  userId    Int
  user      User    @relation(fields: [userId], references: [id])
  content   String
  createdAt DateTime @default(now())

  likes Like[]
}

// Likes
model Like {
  id        Int     @id @default(autoincrement())
  userId    Int
  user      User    @relation(fields: [userId], references: [id])
  postId    Int?
  post      Post?   @relation(fields: [postId], references: [id])
  commentId Int?
  comment   Comment? @relation(fields: [commentId], references: [id])
  createdAt DateTime @default(now())

  @@unique([userId, postId])
  @@unique([userId, commentId])
}

// Follows
model Follow {
  id          Int     @id @default(autoincrement())
  followerId  Int
  follower    User    @relation("follower", fields: [followerId], references: [id])
  followingId Int
  following   User    @relation("following", fields: [followingId], references: [id])
  createdAt   DateTime @default(now())

  @@unique([followerId, followingId])
}

// Messages
model Message {
  id        Int     @id @default(autoincrement())
  senderId  Int
  sender    User    @relation(fields: [senderId], references: [id])
  content   String
  createdAt DateTime @default(now())
}`,

    cms: `
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

// Users (authors/editors)
model User {
  id        Int     @id @default(autoincrement())
  email     String  @unique
  password  String
  name      String
  role      String  @default("editor")
  createdAt DateTime @default(now())

  posts Page[]
}

// Pages
model Page {
  id        Int     @id @default(autoincrement())
  authorId  Int
  author    User    @relation(fields: [authorId], references: [id])
  slug      String  @unique
  title     String
  content   String
  excerpt   String?
  status    String  @default("draft")
  views     Int     @default(0)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  publishedAt DateTime?

  tags     Tag[]
  comments Comment[]
}

// Tags
model Tag {
  id    Int     @id @default(autoincrement())
  name  String  @unique
  slug  String  @unique

  pages Page[]
}

// Comments
model Comment {
  id        Int     @id @default(autoincrement())
  pageId    Int
  page      Page    @relation(fields: [pageId], references: [id])
  author    String
  email     String
  content   String
  approved  Boolean @default(false)
  createdAt DateTime @default(now())
}`,
  };

  return schemas[appType as keyof typeof schemas] || schemas.ecommerce;
}

// ── Environment Template ────────────────────────────────────────

export function getEnvExampleTemplate(): string {
  return `# Database
DATABASE_URL="postgresql://user:password@localhost:5432/dbname"

# Server
PORT=3000
NODE_ENV=development

# API
API_BASE_URL=http://localhost:3000
FRONTEND_URL=http://localhost:5173

# JWT & Auth
JWT_SECRET=your-secret-key-change-this
SESSION_SECRET=your-session-secret

# External APIs (optional)
# STRIPE_KEY=sk_test_...
# SENDGRID_API_KEY=...
# AWS_ACCESS_KEY_ID=...
`;
}

// ── Docker Compose Template ─────────────────────────────────────

export function getDockerComposeTemplate(): string {
  return `version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: fullstack_db
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
      POSTGRES_DB: fullstack_db
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  server:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: fullstack_server
    environment:
      DATABASE_URL: postgresql://postgres:password@postgres:5432/fullstack_db
      NODE_ENV: development
      PORT: 3000
    ports:
      - "3000:3000"
    depends_on:
      postgres:
        condition: service_healthy
    volumes:
      - .:/app
      - /app/node_modules
    command: npm run dev

volumes:
  postgres_data:
`;
}

// ── Dockerfile Template ─────────────────────────────────────────

export function getDockerfileTemplate(): string {
  return `FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
`;
}

// ── Package.json Template ───────────────────────────────────────

export function getPackageJsonTemplate(projectName: string): string {
  return `{
  "name": "${projectName}",
  "version": "1.0.0",
  "type": "module",
  "description": "Full-stack Node.js + React application",
  "scripts": {
    "dev": "node --watch server.js",
    "start": "node server.js",
    "build": "npm run db:generate",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:push": "prisma db push",
    "db:seed": "node prisma/seed.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "@prisma/client": "^5.0.0",
    "dotenv": "^16.3.1",
    "bcrypt": "^5.1.0",
    "jsonwebtoken": "^9.0.2"
  },
  "devDependencies": {
    "@prisma/cli": "^5.0.0",
    "prisma": "^5.0.0"
  }
}`;
}

// ── API Route Templates ─────────────────────────────────────────

export function getHealthRouteTemplate(): string {
  return `import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/health
router.get('/', async (req, res) => {
  try {
    // Test database connection
    await prisma.$queryRaw\`SELECT 1\`;

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'connected'
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

export default router;`;
}

export function getDataRouteTemplate(appType: string): string {
  const templates = {
    ecommerce: `import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/data/products
router.get('/products', async (req, res) => {
  try {
    const products = await prisma.product.findMany({
      take: 20,
      orderBy: { createdAt: 'desc' }
    });
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/data/products/:id
router.get('/products/:id', async (req, res) => {
  try {
    const product = await prisma.product.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { reviews: true }
    });
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/data/orders
router.post('/orders', async (req, res) => {
  try {
    const { userId, items } = req.body;

    const total = await Promise.all(
      items.map(async (item) => {
        const product = await prisma.product.findUnique({
          where: { id: item.productId }
        });
        return product.price * item.quantity;
      })
    ).then(prices => prices.reduce((a, b) => a + b, 0));

    const order = await prisma.order.create({
      data: {
        userId,
        total,
        items: {
          create: items.map(item => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: 0 // Set from product lookup
          }))
        }
      }
    });

    res.status(201).json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;`,

    dashboard: `import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/data/dashboards/:userId
router.get('/dashboards/:userId', async (req, res) => {
  try {
    const dashboards = await prisma.dashboard.findMany({
      where: { userId: parseInt(req.params.userId) },
      include: { widgets: true }
    });
    res.json(dashboards);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/data/metrics/:widgetId
router.get('/metrics/:widgetId', async (req, res) => {
  try {
    const metrics = await prisma.metric.findMany({
      where: { widgetId: parseInt(req.params.widgetId) },
      orderBy: { timestamp: 'desc' },
      take: 100
    });
    res.json(metrics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;`,

    social: `import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/data/posts
router.get('/posts', async (req, res) => {
  try {
    const posts = await prisma.post.findMany({
      include: { user: true, comments: true, likes: true },
      orderBy: { createdAt: 'desc' },
      take: 20
    });
    res.json(posts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/data/users/:id
router.get('/users/:id', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { posts: true, followers: true }
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;`,

    cms: `import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/data/pages (published)
router.get('/pages', async (req, res) => {
  try {
    const pages = await prisma.page.findMany({
      where: { status: 'published' },
      include: { author: true, tags: true },
      orderBy: { publishedAt: 'desc' }
    });
    res.json(pages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/data/pages/:slug
router.get('/pages/:slug', async (req, res) => {
  try {
    const page = await prisma.page.findUnique({
      where: { slug: req.params.slug },
      include: { author: true, tags: true, comments: true }
    });
    if (!page) return res.status(404).json({ error: 'Page not found' });
    res.json(page);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;`,
  };

  return templates[appType as keyof typeof templates] || templates.ecommerce;
}

// ── Frontend React Template ─────────────────────────────────────

export function getReactAppTemplate(): string {
  return `import React, { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/data/');
      if (!response.ok) throw new Error('Failed to fetch data');
      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="loading">Loading...</div>;
  if (error) return <div className="error">Error: {error}</div>;

  return (
    <div className="container">
      <h1>Full-Stack Application</h1>
      <div className="content">
        {data.length === 0 ? (
          <p>No data available</p>
        ) : (
          <ul>
            {data.map((item) => (
              <li key={item.id}>{JSON.stringify(item)}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default App;`;
}

// ── README Template for Full-Stack ──────────────────────────────

export function getFullStackReadmeTemplate(): string {
  return `# Full-Stack Application

A complete Node.js + React + PostgreSQL application with Docker support.

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL (or Docker)
- npm or yarn

### Setup

1. **Clone and install dependencies**
   \`\`\`bash
   npm install
   \`\`\`

2. **Configure environment**
   \`\`\`bash
   cp .env.example .env
   # Edit .env with your database URL
   \`\`\`

3. **Setup database**
   \`\`\`bash
   npm run db:migrate
   npm run db:seed    # Optional: seed with example data
   \`\`\`

4. **Start development servers**
   \`\`\`bash
   npm run dev
   \`\`\`

Server will run on http://localhost:3000
Frontend will run on http://localhost:5173

## With Docker

\`\`\`bash
docker-compose up
\`\`\`

This starts PostgreSQL and the Node.js server automatically.

## Project Structure

\`\`\`
.
├── server.js              # Express server entry point
├── routes/               # API route handlers
│   ├── health.js        # Health check endpoint
│   └── data.js          # Data endpoints
├── prisma/
│   └── schema.prisma    # Database schema
├── public/              # Static files
├── src/                 # Frontend React source
├── package.json
├── .env.example
└── docker-compose.yml
\`\`\`

## Database

This project uses Prisma ORM with PostgreSQL.

### Common Prisma Commands

\`\`\`bash
# Run migrations
npm run db:migrate

# Push schema changes
npm run db:push

# Generate Prisma client
npm run db:generate

# Open Prisma Studio
npx prisma studio
\`\`\`

## API Endpoints

- \`GET /api/health\` - Health check
- \`GET /api/data/\` - Get data

See \`routes/\` for more endpoints.

## Development

Files are watched and reloaded automatically. Just edit and save!

## Deployment

1. Build with \`npm run build\`
2. Set environment variables in your hosting platform
3. Run \`npm start\`

## License

MIT
`;
}
