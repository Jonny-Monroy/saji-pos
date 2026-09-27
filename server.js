require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ===================== DB INIT =====================
async function initDb() {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS products (
                barcode TEXT PRIMARY KEY,
                category TEXT NOT NULL,
                name TEXT NOT NULL,
                stock INTEGER NOT NULL DEFAULT 0,
                price NUMERIC(10,2) NOT NULL,
                emoji TEXT NOT NULL DEFAULT '📦',
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS sales (
                id SERIAL PRIMARY KEY,
                ticket_id INTEGER NOT NULL,
                iso_date DATE NOT NULL,
                sale_time TEXT NOT NULL,
                display_date TEXT NOT NULL,
                subtotal NUMERIC(10,2) NOT NULL,
                discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
                discount_amt NUMERIC(10,2) NOT NULL DEFAULT 0,
                iva NUMERIC(10,2) NOT NULL DEFAULT 0,
                total NUMERIC(10,2) NOT NULL,
                cash NUMERIC(10,2) NOT NULL,
                change_amt NUMERIC(10,2) NOT NULL,
                cashier TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS sale_items (
                id SERIAL PRIMARY KEY,
                sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
                barcode TEXT,
                name TEXT NOT NULL,
                qty INTEGER NOT NULL,
                price NUMERIC(10,2) NOT NULL,
                total NUMERIC(10,2) NOT NULL
            );
            ALTER TABLE sales ADD COLUMN IF NOT EXISTS cashier TEXT;
            CREATE INDEX IF NOT EXISTS idx_sales_iso_date ON sales(iso_date);
            CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id);
            CREATE TABLE IF NOT EXISTS users (
                username TEXT PRIMARY KEY,
                pass TEXT NOT NULL,
                role TEXT NOT NULL CHECK (role IN ('admin','vendedor')),
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        `);

        // Seed settings
        await client.query(
            "INSERT INTO settings (key, value) VALUES ('admin_user', 'admin') ON CONFLICT (key) DO NOTHING"
        );
        await client.query(
            "INSERT INTO settings (key, value) VALUES ('admin_pass', 'admin123') ON CONFLICT (key) DO NOTHING"
        );

        // Seed users (migrar credenciales de settings si existen)
        const { rows: uRows } = await client.query('SELECT COUNT(*) AS n FROM users');
        if (parseInt(uRows[0].n, 10) === 0) {
            const { rows: sRows } = await client.query("SELECT key, value FROM settings WHERE key IN ('admin_user','admin_pass')");
            const creds = { admin_user: 'admin', admin_pass: 'admin123' };
            sRows.forEach(function(r) { creds[r.key] = r.value; });
            await client.query(
                "INSERT INTO users (username, pass, role) VALUES ($1, $2, 'admin') ON CONFLICT (username) DO NOTHING",
                [creds.admin_user, creds.admin_pass]
            );
            await client.query(
                "INSERT INTO users (username, pass, role) VALUES ('vendedor', 'vendedor123', 'vendedor') ON CONFLICT (username) DO NOTHING"
            );
            console.log('Usuarios iniciales creados (admin / vendedor).');
        }
        await client.query(
            "INSERT INTO settings (key, value) VALUES ('ticket_counter', '1001') ON CONFLICT (key) DO NOTHING"
        );

        // Seed products if empty
        const { rows } = await client.query('SELECT COUNT(*) AS n FROM products');
        if (parseInt(rows[0].n, 10) === 0) {
            const seed = [
                ['80010001','Vasos','Vaso Plástico 8oz (paq 50)',40,45.00,'🥤'],
                ['80010002','Vasos','Vaso Plástico 16oz (paq 50)',35,68.00,'🥤'],
                ['80010003','Vasos','Vaso Térmico 12oz (paq 25)',30,55.00,'☕'],
                ['80010004','Vasos','Vaso de Cartón 8oz (paq 50)',25,62.00,'🥤'],
                ['80010005','Platos','Plato Desechable 22cm (paq 25)',50,42.00,'🍽️'],
                ['80010006','Platos','Plato Hondo Térmico (paq 25)',30,58.00,'🥣'],
                ['80010007','Platos','Charola Unicel NS-3 (paq 25)',20,72.00,'🍛'],
                ['80010008','Platos','Plato de Barro 20cm (paq 20)',15,65.00,'🍽️'],
                ['80010009','Cubiertos','Tenedor Plástico (paq 50)',60,18.00,'🍴'],
                ['80010010','Cubiertos','Cuchara Plástica (paq 50)',60,18.00,'🥄'],
                ['80010011','Cubiertos','Cuchillo Plástico (paq 50)',55,18.00,'🔪'],
                ['80010012','Cubiertos','Servilletas (paq 200)',70,25.00,'🍽️'],
                ['80010013','Contenedores','Contenedor c/tapa 500ml (paq 20)',25,55.00,'🥡'],
                ['80010014','Contenedores','Contenedor c/tapa 1L (paq 20)',20,78.00,'🥡'],
                ['80010015','Contenedores','Portavasos 4 espacios (paq 25)',18,38.00,'🧃'],
                ['80010016','Contenedores','Charola Aluminio c/tapa (paq 10)',22,65.00,'🥘'],
                ['80010017','Bolsas','Bolsa Camiseta Mediana (rollo 100)',45,32.00,'🛍️'],
                ['80010018','Bolsas','Bolsa Camiseta Grande (rollo 100)',40,45.00,'🛍️'],
                ['80010019','Bolsas','Bolsa Papel Kraft (paq 50)',30,42.00,'🥡'],
                ['80010020','Bolsas','Bolsa Celofán (paq 100)',35,28.00,'🎁'],
                ['80010021','Embalaje','Cinta Adhesiva Transparente 48mm',50,22.00,'🩹'],
                ['80010022','Embalaje','Cinta Canela Empaque 48mm',45,24.00,'🩹'],
                ['80010023','Embalaje','Caja de Cartón 40x30x30',35,28.00,'📦'],
                ['80010024','Embalaje','Papel Burbuja rollo 10m',12,95.00,'🫧'],
                ['80010025','Embalaje','Playo Stretch Film 50cm',10,120.00,'📦'],
                ['80010026','Embalaje','Etiquetas Térmicas (rollo 500)',20,55.00,'🏷️']
            ];
            for (const p of seed) {
                await client.query(
                    'INSERT INTO products (barcode, category, name, stock, price, emoji) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (barcode) DO NOTHING',
                    p
                );
            }
            console.log('Productos iniciales insertados.');
        }
        console.log('Base de datos inicializada OK.');
    } finally {
        client.release();
    }
}

// ===================== AUTH =====================
function getAuthUser(req) {
    const user = req.headers['x-admin-user'];
    const pass = req.headers['x-admin-pass'];
    if (!user || !pass) return Promise.resolve(null);
    return pool.query('SELECT username, role FROM users WHERE username=$1 AND pass=$2', [user, pass])
        .then(({ rows }) => rows.length ? rows[0] : null)
        .catch(() => null);
}

function requireAdmin(req, res, next) {
    getAuthUser(req).then(u => {
        if (u && u.role === 'admin') { req.authUser = u.username; next(); }
        else res.status(401).json({ error: 'No autorizado' });
    });
}

// ===================== API: CONFIG =====================
app.get('/api/config', (req, res) => {
    res.json({ ivaRate: parseFloat(process.env.IVA_RATE || '0.16') });
});

// ===================== API: PRODUCTS =====================
app.get('/api/products', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT barcode, category, name, stock, price::float AS price, emoji FROM products ORDER BY category, name');
        res.json(rows);
    } catch (e) { console.error(e); res.status(500).json({ error: 'Error al cargar productos' }); }
});

app.post('/api/products', requireAdmin, async (req, res) => {
    const { name, category, price, stock, emoji } = req.body || {};
    if (!name || !category || !(price > 0) || !(stock >= 0)) {
        return res.status(400).json({ error: 'Datos de producto inválidos' });
    }
    const barcode = '800' + String(Date.now()).slice(-7);
    try {
        const { rows } = await pool.query(
            'INSERT INTO products (barcode, category, name, stock, price, emoji) VALUES ($1,$2,$3,$4,$5,$6) RETURNING barcode, category, name, stock, price::float AS price, emoji',
            [barcode, category, name, stock, price, emoji || '📦']
        );
        res.json(rows[0]);
    } catch (e) { console.error(e); res.status(500).json({ error: 'Error al crear producto' }); }
});

app.put('/api/products/:barcode', requireAdmin, async (req, res) => {
    const { name, category, price, stock, emoji } = req.body || {};
    if (!name || !category || !(price > 0) || !(stock >= 0)) {
        return res.status(400).json({ error: 'Datos de producto inválidos' });
    }
    try {
        const { rows } = await pool.query(
            'UPDATE products SET name=$1, category=$2, price=$3, stock=$4, emoji=$5 WHERE barcode=$6 RETURNING barcode, category, name, stock, price::float AS price, emoji',
            [name, category, price, stock, emoji || '📦', req.params.barcode]
        );
        if (!rows.length) return res.status(404).json({ error: 'Producto no encontrado' });
        res.json(rows[0]);
    } catch (e) { console.error(e); res.status(500).json({ error: 'Error al actualizar producto' }); }
});

app.patch('/api/products/:barcode/stock', requireAdmin, async (req, res) => {
    const stock = parseInt(req.body && req.body.stock, 10);
    if (isNaN(stock) || stock < 0) return res.status(400).json({ error: 'Stock inválido' });
    try {
        const { rows } = await pool.query(
            'UPDATE products SET stock=$1 WHERE barcode=$2 RETURNING barcode, stock',
            [stock, req.params.barcode]
        );
        if (!rows.length) return res.status(404).json({ error: 'Producto no encontrado' });
        res.json(rows[0]);
    } catch (e) { console.error(e); res.status(500).json({ error: 'Error al ajustar stock' }); }
});

app.delete('/api/products/:barcode', requireAdmin, async (req, res) => {
    try {
        const result = await pool.query('DELETE FROM products WHERE barcode=$1', [req.params.barcode]);
        if (!result.rowCount) return res.status(404).json({ error: 'Producto no encontrado' });
        res.json({ ok: true });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Error al eliminar producto' }); }
});

// ===================== API: SALES =====================
app.post('/api/sales', async (req, res) => {
    const { items, discountPct, cash } = req.body || {};
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'Venta sin artículos' });
    const cashier = await getAuthUser(req);
    if (!cashier) return res.status(401).json({ error: 'Debe iniciar sesión para vender' });
    const pct = Math.max(0, Math.min(100, parseFloat(discountPct) || 0));
    const cashNum = parseFloat(cash) || 0;
    const ivaRate = parseFloat(process.env.IVA_RATE || '0.16');

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        let subtotal = 0;
        const lineItems = [];
        for (const it of items) {
            const { rows } = await client.query('SELECT * FROM products WHERE barcode=$1 FOR UPDATE', [it.barcode]);
            if (!rows.length) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Producto no existe: ' + it.barcode }); }
            const p = rows[0];
            const qty = parseInt(it.qty, 10);
            if (!qty || qty <= 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Cantidad inválida' }); }
            if (p.stock < qty) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Stock insuficiente: ' + p.name }); }
            subtotal += qty * parseFloat(p.price);
            lineItems.push({ barcode: p.barcode, name: p.name, qty: qty, price: parseFloat(p.price), total: qty * parseFloat(p.price) });
        }
        const discountAmt = subtotal * (pct / 100);
        const subtotalAfterDiscount = subtotal - discountAmt;
        const iva = subtotalAfterDiscount * ivaRate;
        const total = subtotalAfterDiscount + iva;
        if (cashNum < total) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Efectivo insuficiente' }); }
        const changeAmt = cashNum - total;

        const { rows: tRows } = await client.query("UPDATE settings SET value = (COALESCE(NULLIF(value,'')::int, 1000) + 1)::text WHERE key='ticket_counter' RETURNING value");
        const ticketId = parseInt(tRows[0].value, 10);

        const now = new Date();
        const isoDate = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
        const saleTime = now.toLocaleTimeString('es-MX');
        const displayDate = now.toLocaleDateString('es-MX');

        const { rows: sRows } = await client.query(
            'INSERT INTO sales (ticket_id, iso_date, sale_time, display_date, cashier, subtotal, discount_pct, discount_amt, iva, total, cash, change_amt) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id',
            [ticketId, isoDate, saleTime, displayDate, cashier.username, subtotal.toFixed(2), pct, discountAmt.toFixed(2), iva.toFixed(2), total.toFixed(2), cashNum.toFixed(2), changeAmt.toFixed(2)]
        );
        const saleId = sRows[0].id;

        for (const li of lineItems) {
            await client.query(
                'INSERT INTO sale_items (sale_id, barcode, name, qty, price, total) VALUES ($1,$2,$3,$4,$5,$6)',
                [saleId, li.barcode, li.name, li.qty, li.price.toFixed(2), li.total.toFixed(2)]
            );
            await client.query('UPDATE products SET stock = stock - $1 WHERE barcode=$2', [li.qty, li.barcode]);
        }
        await client.query('COMMIT');
        res.json({
            ok: true,
            sale: {
                ticketId: ticketId,
                date: displayDate,
                time: saleTime,
                items: lineItems,
                cashier: cashier.username,
                subtotal: subtotal,
                discountPct: pct,
                discountAmt: discountAmt,
                subtotalAfterDiscount: subtotalAfterDiscount,
                iva: iva,
                ivaRate: ivaRate,
                total: total,
                cash: cashNum,
                change: changeAmt
            }
        });
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        console.error(e);
        res.status(500).json({ error: 'Error al registrar la venta' });
    } finally {
        client.release();
    }
});

app.get('/api/sales', requireAdmin, async (req, res) => {
    const { from, to } = req.query;
    let sql = 'SELECT id, ticket_id, iso_date::text AS iso_date, sale_time, display_date, cashier, subtotal::float, discount_pct::float, discount_amt::float, iva::float, total::float, cash::float, change_amt::float FROM sales';
    const params = [];
    if (from && to) {
        sql += ' WHERE iso_date BETWEEN $1 AND $2';
        params.push(from, to);
    }
    sql += ' ORDER BY created_at DESC';
    try {
        const { rows: sales } = await pool.query(sql, params);
        const saleIds = sales.map(s => s.id);
        let items = [];
        if (saleIds.length) {
            const { rows: ir } = await pool.query(
                'SELECT sale_id, barcode, name, qty, price::float AS price, total::float AS total FROM sale_items WHERE sale_id = ANY($1::int[])',
                [saleIds]
            );
            items = ir;
        }
        const byId = {};
        items.forEach(it => {
            if (!byId[it.sale_id]) byId[it.sale_id] = [];
            byId[it.sale_id].push({ barcode: it.barcode, name: it.name, qty: it.qty, price: it.price, total: it.total });
        });
        res.json(sales.map(s => ({
            ticketId: s.ticket_id,
            date: s.display_date,
            isoDate: s.iso_date,
            time: s.sale_time,
            cashier: s.cashier,
            items: byId[s.id] || [],
            subtotal: s.subtotal,
            discountPct: s.discount_pct,
            discountAmt: s.discount_amt,
            iva: s.iva,
            total: s.total,
            cash: s.cash,
            change: s.change_amt
        })));
    } catch (e) { console.error(e); res.status(500).json({ error: 'Error al cargar ventas' }); }
});

app.delete('/api/sales', requireAdmin, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM sale_items');
        await client.query('DELETE FROM sales');
        await client.query("UPDATE settings SET value='1001' WHERE key='ticket_counter'");
        await client.query('COMMIT');
        res.json({ ok: true });
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        console.error(e);
        res.status(500).json({ error: 'Error al borrar historial' });
    } finally {
        client.release();
    }
});

// ===================== API: AUTH / USERS =====================
app.post('/api/auth/login', async (req, res) => {
    const { user, pass } = req.body || {};
    if (!user || !pass) return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    try {
        const { rows } = await pool.query('SELECT username, role FROM users WHERE username=$1 AND pass=$2', [user, pass]);
        if (rows.length) {
            res.json({ ok: true, user: rows[0].username, role: rows[0].role });
        } else {
            res.status(401).json({ error: 'Credenciales incorrectas' });
        }
    } catch (e) { console.error(e); res.status(500).json({ error: 'Error de servidor' }); }
});

// Cambiar la contraseña del usuario autenticado (admin o vendedor)
app.post('/api/auth/change-password', async (req, res) => {
    const { user, currentPass, newPass } = req.body || {};
    if (!user || !currentPass || !newPass) return res.status(400).json({ error: 'Datos incompletos' });
    if (newPass.length < 4) return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 4 caracteres' });
    try {
        const result = await pool.query('UPDATE users SET pass=$1 WHERE username=$2 AND pass=$3', [newPass, user, currentPass]);
        if (!result.rowCount) return res.status(400).json({ error: 'Contraseña actual incorrecta' });
        res.json({ ok: true });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Error de servidor' }); }
});

// Gestión de usuarios (solo admin)
app.get('/api/admin/users', requireAdmin, async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT username, role, created_at FROM users ORDER BY created_at');
        res.json(rows);
    } catch (e) { console.error(e); res.status(500).json({ error: 'Error de servidor' }); }
});

app.post('/api/admin/users', requireAdmin, async (req, res) => {
    const { username, pass, role } = req.body || {};
    const name = (username || '').trim().toLowerCase();
    if (!/^[a-z0-9_.-]{3,20}$/.test(name)) return res.status(400).json({ error: 'Usuario inválido (3-20 chars, letras/números)' });
    if (!pass || pass.length < 4) return res.status(400).json({ error: 'Contraseña mínimo 4 caracteres' });
    if (!['admin', 'vendedor'].includes(role)) return res.status(400).json({ error: 'Rol inválido' });
    try {
        await pool.query('INSERT INTO users (username, pass, role) VALUES ($1,$2,$3)', [name, pass, role]);
        res.json({ ok: true, username: name, role: role });
    } catch (e) {
        if (e.code === '23505') return res.status(400).json({ error: 'El usuario ya existe' });
        console.error(e);
        res.status(500).json({ error: 'Error de servidor' });
    }
});

app.delete('/api/admin/users/:username', requireAdmin, async (req, res) => {
    const target = req.params.username;
    if (target === req.authUser) return res.status(400).json({ error: 'No puede eliminar su propio usuario' });
    try {
        const { rows } = await pool.query('SELECT role FROM users WHERE username=$1', [target]);
        if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
        if (rows[0].role === 'admin') {
            const { rows: admins } = await pool.query("SELECT COUNT(*) AS n FROM users WHERE role='admin'");
            if (parseInt(admins[0].n, 10) <= 1) return res.status(400).json({ error: 'Debe existir al menos un administrador' });
        }
        await pool.query('DELETE FROM users WHERE username=$1', [target]);
        res.json({ ok: true });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Error de servidor' }); }
});

// ===================== INVENTORY SUMMARY =====================
app.get('/api/inventory/summary', requireAdmin, async (req, res) => {
    try {
        const { rows } = await pool.query(`
            SELECT
                si.barcode AS barcode,
                si.name AS name,
                SUM(si.qty)::int AS qty,
                SUM(si.total)::float AS amount
            FROM sale_items si
            GROUP BY si.barcode, si.name
        `);
        // Totales por barcode y por nombre (para ventas antiguas sin barcode)
        const byBarcode = {};
        const byName = {};
        rows.forEach(r => {
            if (r.barcode) byBarcode[r.barcode] = { qty: r.qty, amount: r.amount };
            else byName[r.name] = { qty: r.qty, amount: r.amount };
        });
        res.json({ byBarcode: byBarcode, byName: byName });
    } catch (e) { console.error(e); res.status(500).json({ error: 'Error de servidor' }); }
});

// ===================== START =====================
initDb()
    .then(() => {
        app.listen(PORT, () => {
            console.log('POS Grupo SAJI Bogotá SAS corriendo en http://localhost:' + PORT);
        });
    })
    .catch(err => {
        console.error('Error al conectar a la base de datos:', err.message);
        process.exit(1);
    });
