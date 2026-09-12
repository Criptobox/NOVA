-- ============================================================
-- NOVA v013 — setup.sql (PostgreSQL · PLAN B opcional)
-- Normalmente NO hace falta: el build de Vercel crea las tablas
-- solo (prisma db push) al conectar Vercel Postgres y redesplegar.
-- PLAN B: pega TODO este archivo en Storage → tu base → pestaña
-- Query → Run. Es idempotente: puedes pegarlo dos veces sin romper
-- nada (CREATE TABLE IF NOT EXISTS).
-- Crea TODAS las tablas: conversaciones, cripto, tienda (TiendaMax),
-- trading automatizado y sniper.
-- ============================================================

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE IF NOT EXISTS "Contact" (
    "id" TEXT NOT NULL,
    "waId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'whatsapp',
    "botPaused" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Message" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'text',
    "body" TEXT NOT NULL,
    "meta" TEXT,
    "intent" TEXT,
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PriceAlert" (
    "id" TEXT NOT NULL,
    "coinId" TEXT NOT NULL,
    "sym" TEXT NOT NULL,
    "dir" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "on" BOOLEAN NOT NULL DEFAULT true,
    "fired" BOOLEAN NOT NULL DEFAULT false,
    "firedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Holding" (
    "id" TEXT NOT NULL,
    "coinId" TEXT NOT NULL,
    "sym" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amt" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Holding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ScheduledJob" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "target" TEXT NOT NULL DEFAULT 'owner',
    "when" TIMESTAMP(3) NOT NULL,
    "repeat" TEXT NOT NULL DEFAULT 'none',
    "lastRun" TIMESTAMP(3),
    "on" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduledJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Setting" (
    "id" TEXT NOT NULL DEFAULT 'nova',
    "persona" TEXT NOT NULL DEFAULT 'profesional',
    "mode247" BOOLEAN NOT NULL DEFAULT true,
    "startHour" INTEGER NOT NULL DEFAULT 8,
    "endHour" INTEGER NOT NULL DEFAULT 22,
    "maxMsgsPerMin" INTEGER NOT NULL DEFAULT 20,
    "ownerWa" TEXT NOT NULL DEFAULT '',
    "aiEnabled" BOOLEAN NOT NULL DEFAULT true,
    "dailySummaryOn" BOOLEAN NOT NULL DEFAULT false,
    "dailySummaryHour" INTEGER NOT NULL DEFAULT 9,
    "waToken" TEXT NOT NULL DEFAULT '',
    "waPhoneId" TEXT NOT NULL DEFAULT '',
    "waVerifyToken" TEXT NOT NULL DEFAULT 'nova-verify',
    "vapidPub" TEXT NOT NULL DEFAULT '',
    "vapidPriv" TEXT NOT NULL DEFAULT '',
    "ghUser" TEXT NOT NULL DEFAULT '',
    "ghRepo" TEXT NOT NULL DEFAULT 'Tiendamax',
    "ghBranch" TEXT NOT NULL DEFAULT 'main',
    "ghPath" TEXT NOT NULL DEFAULT 'productos.json',
    "ghSite" TEXT NOT NULL DEFAULT 'https://tiendamax.org',
    "ghToken" TEXT NOT NULL DEFAULT '',
    "shopSim" BOOLEAN NOT NULL DEFAULT true,
    "lowStock" INTEGER NOT NULL DEFAULT 3,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PushSub" (
    "id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "ua" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSub_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ShopProduct" (
    "id" TEXT NOT NULL,
    "extId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "slug" TEXT NOT NULL DEFAULT '',
    "categoria" TEXT NOT NULL DEFAULT '',
    "subcat" TEXT NOT NULL DEFAULT '',
    "precio" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "imagen" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "StockMove" (
    "id" TEXT NOT NULL,
    "extId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "before" INTEGER NOT NULL,
    "after" INTEGER NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 0,
    "unitPrice" DOUBLE PRECISION,
    "total" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "note" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'voz',
    "sync" TEXT NOT NULL DEFAULT 'local',
    "commitUrl" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMove_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "TradingConfig" (
    "id" TEXT NOT NULL DEFAULT 'trading',
    "on" BOOLEAN NOT NULL DEFAULT false,
    "simMode" BOOLEAN NOT NULL DEFAULT true,
    "symbols" TEXT NOT NULL DEFAULT 'BTCUSDT,ETHUSDT,SOLUSDT',
    "maxPosQuote" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "maxPctCapital" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "stopLossPct" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "takeProfitPct" DOUBLE PRECISION NOT NULL DEFAULT 4,
    "maxTradesHour" INTEGER NOT NULL DEFAULT 3,
    "sniperOn" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradingConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ExchangeCredentials" (
    "id" TEXT NOT NULL,
    "exchange" TEXT NOT NULL DEFAULT 'binance',
    "label" TEXT NOT NULL DEFAULT 'principal',
    "apiKeyEnc" TEXT NOT NULL,
    "apiSecEnc" TEXT NOT NULL,
    "testnet" BOOLEAN NOT NULL DEFAULT true,
    "on" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExchangeCredentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "TradeLog" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'MARKET',
    "price" DOUBLE PRECISION NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,
    "quoteQty" DOUBLE PRECISION NOT NULL,
    "result" DOUBLE PRECISION,
    "mode" TEXT NOT NULL DEFAULT 'sim',
    "signal" TEXT NOT NULL DEFAULT '',
    "reason" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'filled',
    "pairId" TEXT,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradeLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SniperWatch" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "base" TEXT NOT NULL DEFAULT '',
    "quote" TEXT NOT NULL DEFAULT '',
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "handled" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "SniperWatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Contact_waId_key" ON "Contact"("waId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Holding_coinId_key" ON "Holding"("coinId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PushSub_endpoint_key" ON "PushSub"("endpoint");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ShopProduct_extId_key" ON "ShopProduct"("extId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SniperWatch_symbol_key" ON "SniperWatch"("symbol");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

