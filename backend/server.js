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

 // Buscar sessão ativa pelo telefone
app.get("/sessoes/:telefone", async (req, res) => {
    const telefone = req.params.telefone;

    try {
        const resultado = await pool.query(
            `SELECT *
             FROM sessoes_chatbot
             WHERE telefone = $1 AND ativa = TRUE
             ORDER BY data_atualizacao DESC
             LIMIT 1`,
            [telefone]
        );

        if (resultado.rows.length === 0) {
            return res.json({
                mensagem: "Nenhuma sessão ativa encontrada.",
                sessao: null
            });
        }

        res.json({
            mensagem: "Sessão encontrada!",
            sessao: resultado.rows[0]
        });
    } catch (erro) {
        console.error(erro);
        res.status(500).json({
            mensagem: "Erro ao buscar sessão."
        });
    }
});

// Criar sessão para um cliente
app.post("/sessoes", async (req, res) => {
    const { telefone } = req.body;

    if (!telefone || !telefone.trim()) {
        return res.status(400).json({
            mensagem: "Informe o telefone do cliente."
        });
    }

    try {
        const existente = await pool.query(
            `SELECT *
             FROM sessoes_chatbot
             WHERE telefone = $1 AND ativa = TRUE
             ORDER BY data_atualizacao DESC
             LIMIT 1`,
            [telefone]
        );

        if (existente.rows.length > 0) {
            return res.json({
                mensagem: "O cliente já possui uma sessão ativa.",
                sessao: existente.rows[0]
            });
        }

        const resultado = await pool.query(
            `INSERT INTO sessoes_chatbot (telefone)
             VALUES ($1)
             RETURNING *`,
            [telefone]
        );

        res.status(201).json({
            mensagem: "Sessão criada com sucesso!",
            sessao: resultado.rows[0]
        });
    } catch (erro) {
        console.error(erro);
        res.status(500).json({
            mensagem: "Erro ao criar sessão."
        });
    }
});

app.post("/pedidos", async (req, res) => {
    const {
        cliente,
        telefone,
        endereco,
        itens,
        produto,
        sabor,
        tamanho,
        quantidade,
        forma_pagamento
    } = req.body;

    // Mantém compatibilidade com o formulário antigo:
    // se vier apenas um produto, transforma em uma lista.
    const listaItens = Array.isArray(itens)
        ? itens
        : [{ produto, sabor, tamanho, quantidade }];

    if (
        !cliente ||
        !telefone ||
        !endereco ||
        !forma_pagamento ||
        listaItens.length === 0
    ) {
        return res.status(400).json({
            mensagem: "Preencha os dados do cliente e pelo menos um item."
        });
    }

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        // Validar e preparar todos os itens antes de cadastrar o pedido.
        const itensValidados = [];
        let valorTotal = 0;

        for (const item of listaItens) {
            const quantidadeItem = Number(item.quantidade);

            if (
                !item.produto ||
                !Number.isInteger(quantidadeItem) ||
                quantidadeItem <= 0
            ) {
                throw new Error(
                    "Cada item precisa ter um produto e uma quantidade inteira maior que zero."
                );
            }

            const produtoEncontrado = await client.query(
                "SELECT id, preco FROM produtos WHERE nome = $1",
                [item.produto]
            );

            if (produtoEncontrado.rows.length === 0) {
                throw new Error(`Produto não encontrado: ${item.produto}`);
            }

            const produtoId = produtoEncontrado.rows[0].id;
            const preco = Number(produtoEncontrado.rows[0].preco);

            let saborId = null;

            if (item.sabor) {
                const saborEncontrado = await client.query(
                    "SELECT id FROM sabores WHERE nome = $1 AND ativo = TRUE",
                    [item.sabor]
                );

                if (saborEncontrado.rows.length === 0) {
                    throw new Error(`Sabor não encontrado: ${item.sabor}`);
                }

                saborId = saborEncontrado.rows[0].id;
            }

            valorTotal += preco * quantidadeItem;

            itensValidados.push({
                produtoId,
                saborId,
                tamanho: item.tamanho || null,
                quantidade: quantidadeItem,
                preco
            });
        }

        // Cadastrar cliente somente após validar os itens.
        const novoCliente = await client.query(
            `INSERT INTO clientes (nome, telefone, endereco)
             VALUES ($1, $2, $3)
             RETURNING id`,
            [cliente, telefone, endereco]
        );

        const clienteId = novoCliente.rows[0].id;

        // Criar o pedido com o valor total de todos os itens.
        const novoPedido = await client.query(
            `INSERT INTO pedidos
             (cliente_id, forma_pagamento, status, valor_total)
             VALUES ($1, $2, 'Recebido', $3)
             RETURNING id, status, valor_total, data_hora`,
            [clienteId, forma_pagamento, valorTotal]
        );

        const pedidoId = novoPedido.rows[0].id;

        // Registrar todos os itens associados ao mesmo pedido.
        for (const item of itensValidados) {
            await client.query(
                `INSERT INTO itens_pedido
                 (pedido_id, produto_id, sabor_id, tamanho, quantidade, preco)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [
                    pedidoId,
                    item.produtoId,
                    item.saborId,
                    item.tamanho,
                    item.quantidade,
                    item.preco
                ]
            );
        }

        await client.query("COMMIT");

        res.status(201).json({
            mensagem: "Pedido criado com sucesso!",
            pedido: {
                id: pedidoId,
                cliente,
                telefone,
                endereco,
                itens: itensValidados,
                forma_pagamento,
                valor_total: valorTotal,
                status: novoPedido.rows[0].status,
                data_hora: novoPedido.rows[0].data_hora
            }
        });
    } catch (erro) {
        await client.query("ROLLBACK");

        console.error(erro);

        const erroDeValidacao =
            erro.message.startsWith("Produto não encontrado:") ||
            erro.message.startsWith("Sabor não encontrado:") ||
            erro.message.startsWith("Cada item precisa");

        res.status(erroDeValidacao ? 400 : 500).json({
            mensagem: erroDeValidacao
                ? erro.message
                : "Erro ao criar pedido."
        });
    } finally {
        client.release();
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