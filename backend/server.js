const express = require("express");
const pool = require("./database");
const cors = require("cors");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Rota principal
app.get("/", (req, res) => {
    res.json({
        mensagem: "🍦 Sistema da Sorveteria funcionando!"
    });
});

// Teste de conexão com o banco
app.get("/teste-banco", async (req, res) => {
    try {
        const resultado = await pool.query("SELECT NOW()");

        res.json({
            mensagem: "Conexão com PostgreSQL funcionando!",
            horario: resultado.rows[0].now
        });
    } catch (erro) {
        console.error(erro);

        res.status(500).json({
            mensagem: "Erro ao conectar com o PostgreSQL."
        });
    }
});

// Listar pedidos
app.get("/pedidos", async (req, res) => {
    try {
        const resultado = await pool.query(`
            SELECT 
                p.id,
                c.nome AS cliente,
                c.telefone,
                c.endereco,
                p.forma_pagamento,
                p.status,
                p.valor_total,
                p.data_hora,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'produto', pr.nome,
                            'sabor', s.nome,
                            'tamanho', ip.tamanho,
                            'quantidade', ip.quantidade,
                            'preco', ip.preco
                        )
                    ) FILTER (WHERE ip.id IS NOT NULL),
                    '[]'
                ) AS itens
            FROM pedidos p
            INNER JOIN clientes c 
                ON c.id = p.cliente_id
            LEFT JOIN itens_pedido ip 
                ON ip.pedido_id = p.id
            LEFT JOIN produtos pr 
                ON pr.id = ip.produto_id
            LEFT JOIN sabores s 
                ON s.id = ip.sabor_id
            GROUP BY 
                p.id,
                c.nome,
                c.telefone,
                c.endereco,
                p.forma_pagamento,
                p.status,
                p.valor_total,
                p.data_hora
            ORDER BY p.data_hora DESC
        `);

        res.json(resultado.rows);

    } catch (erro) {
        console.error(erro);

        res.status(500).json({
            mensagem: "Erro ao buscar pedidos."
        });
    }
});

// Criar pedido
app.post("/pedidos", async (req, res) => {
    const {
        cliente,
        telefone,
        endereco,
        produto,
        sabor,
        tamanho,
        quantidade,
        forma_pagamento
    } = req.body;

    try {
        // Criar cliente
        const novoCliente = await pool.query(
            `
            INSERT INTO clientes (nome, telefone, endereco)
            VALUES ($1, $2, $3)
            RETURNING id
            `,
            [cliente, telefone, endereco]
        );

        const clienteId = novoCliente.rows[0].id;

        // Buscar produto
        const produtoEncontrado = await pool.query(
            "SELECT id, preco FROM produtos WHERE nome = $1",
            [produto]
        );

        if (produtoEncontrado.rows.length === 0) {
            return res.status(400).json({
                mensagem: "Produto não encontrado."
            });
        }

        const produtoId = produtoEncontrado.rows[0].id;
        const preco = produtoEncontrado.rows[0].preco;

        // Buscar sabor
        const saborEncontrado = await pool.query(
            "SELECT id FROM sabores WHERE nome = $1 AND ativo = TRUE",
            [sabor]
        );

        if (saborEncontrado.rows.length === 0) {
            return res.status(400).json({
                mensagem: "Sabor não encontrado."
            });
        }

        const saborId = saborEncontrado.rows[0].id;

        // Calcular valor
        const valorTotal = Number(preco) * Number(quantidade);

        // Criar pedido
        const novoPedido = await pool.query(
            `
            INSERT INTO pedidos 
            (cliente_id, forma_pagamento, status, valor_total)
            VALUES ($1, $2, 'Recebido', $3)
            RETURNING id, status, valor_total, data_hora
            `,
            [clienteId, forma_pagamento, valorTotal]
        );

        const pedidoId = novoPedido.rows[0].id;

        // Criar item do pedido
        await pool.query(
            `
            INSERT INTO itens_pedido
            (pedido_id, produto_id, sabor_id, tamanho, quantidade, preco)
            VALUES ($1, $2, $3, $4, $5, $6)
            `,
            [
                pedidoId,
                produtoId,
                saborId,
                tamanho,
                quantidade,
                preco
            ]
        );

        res.status(201).json({
            mensagem: "Pedido criado com sucesso!",
            pedido: {
                id: pedidoId,
                cliente,
                produto,
                sabor,
                tamanho,
                quantidade,
                forma_pagamento,
                valor_total: valorTotal,
                status: "Recebido"
            }
        });

    } catch (erro) {
        console.error(erro);

        res.status(500).json({
            mensagem: "Erro ao criar pedido."
        });
    }
});

// Alterar status do pedido
app.put("/pedidos/:id/status", async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    const statusPermitidos = [
        "Recebido",
        "Preparando",
        "Pronto",
        "Em entrega",
        "Entregue"
    ];

    if (!statusPermitidos.includes(status)) {
        return res.status(400).json({
            mensagem: "Status inválido."
        });
    }

    try {
        const resultado = await pool.query(
            `
            UPDATE pedidos
            SET status = $1
            WHERE id = $2
            RETURNING id, status
            `,
            [status, id]
        );

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                mensagem: "Pedido não encontrado."
            });
        }

        res.json({
            mensagem: "Status atualizado com sucesso!",
            pedido: resultado.rows[0]
        });

    } catch (erro) {
        console.error(erro);

        res.status(500).json({
            mensagem: "Erro ao atualizar o status."
        });
    }
});

// Listar produtos
app.get("/produtos", async (req, res) => {
    try {
        const resultado = await pool.query(
            "SELECT * FROM produtos ORDER BY nome"
        );

        res.json(resultado.rows);
    } catch (erro) {
        console.error(erro);

        res.status(500).json({
            mensagem: "Erro ao buscar produtos."
        });
    }
});

// Listar sabores
app.get("/sabores", async (req, res) => {
    try {
        const resultado = await pool.query(
            "SELECT * FROM sabores WHERE ativo = TRUE ORDER BY nome"
        );

        res.json(resultado.rows);
    } catch (erro) {
        console.error(erro);

        res.status(500).json({
            mensagem: "Erro ao buscar sabores."
        });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});