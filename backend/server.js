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

app.put("/sessoes/:id", async (req, res) => {
    const { id } = req.params;
    const { estado, dados_conversa } = req.body;

    const estadosPermitidos = [
        "inicio",
        "escolhendo_produto",
        "informando_endereco",
        "escolhendo_pagamento",
        "confirmando_pedido",
        "finalizado"
    ];

    if (!estadosPermitidos.includes(estado)) {
        return res.status(400).json({
            mensagem: "Estado da conversa inválido."
        });
    }

    try {
        const resultado = await pool.query(
            `UPDATE sessoes_chatbot
             SET estado = $1,
                 dados_conversa = $2,
                 data_atualizacao = CURRENT_TIMESTAMP
             WHERE id = $3 AND ativa = TRUE
             RETURNING *`,
            [
                estado,
                JSON.stringify(dados_conversa || {}),
                id
            ]
        );

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                mensagem: "Sessão ativa não encontrada."
            });
        }

        res.json({
            mensagem: "Sessão atualizada com sucesso!",
            sessao: resultado.rows[0]
        });
    } catch (erro) {
        console.error(erro);
        res.status(500).json({
            mensagem: "Erro ao atualizar sessão."
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



app.post("/chatbot/mensagem", async (req, res) => {
    const { telefone, mensagem } = req.body;

    if (
        !telefone ||
        typeof telefone !== "string" ||
        !mensagem ||
        typeof mensagem !== "string" ||
        !mensagem.trim()
    ) {
        return res.status(400).json({
            mensagem: "Informe o telefone e a mensagem do cliente."
        });
    }

    try {
        let resultado = await pool.query(
            `SELECT *
             FROM sessoes_chatbot
             WHERE telefone = $1 AND ativa = TRUE
             ORDER BY data_atualizacao DESC
             LIMIT 1`,
            [telefone]
        );

        let sessao;

        if (resultado.rows.length === 0) {
            resultado = await pool.query(
                `INSERT INTO sessoes_chatbot (telefone)
                 VALUES ($1)
                 RETURNING *`,
                [telefone]
            );
            sessao = resultado.rows[0];
        } else {
            sessao = resultado.rows[0];
        }

        const texto = mensagem.trim().toLowerCase();
        let resposta;
        let novoEstado = sessao.estado;
        let dados = sessao.dados_conversa || {};

        if (
            ["oi", "olá", "ola", "bom dia", "boa tarde", "boa noite", "menu"].includes(texto)
        ) {
            resposta =
                "Olá! 🍦 Bem-vindo à nossa sorveteria!\n\n" +
                "Digite uma opção:\n" +
                "1 - Ver cardápio\n" +
                "2 - Fazer pedido\n" +
                "3 - Falar com atendente";

            novoEstado = "inicio";

        } else if ((texto === "1" || texto === "2") && sessao.estado === "inicio") {
            const produtos = await pool.query(
                "SELECT id, nome, preco FROM produtos ORDER BY id"
            );

            dados.produtos_disponiveis = produtos.rows;

            resposta =
                "🍨 Nosso cardápio:\n\n" +
                produtos.rows
                    .map((p, i) =>
                        `${i + 1} - ${p.nome} - R$ ${Number(p.preco).toFixed(2)}`
                    )
                    .join("\n") +
                "\n\nDigite o número do produto que deseja escolher.";

            novoEstado = "escolhendo_produto";

        } else if (sessao.estado === "escolhendo_produto") {
            const numero = Number(texto);
            const produtos = dados.produtos_disponiveis || [];
            const produto = produtos[numero - 1];

            if (!Number.isInteger(numero) || !produto) {
                resposta =
                    "Não encontrei esse produto. Digite um número válido do cardápio.";
            } else {
                dados.item_atual = {
                    produto_id: produto.id,
                    produto: produto.nome,
                    preco: Number(produto.preco),
                    quantidade: 1
                };

                resposta =
                    `Você escolheu ${produto.nome}! 🍦\n\n` +
                    "Agora digite a quantidade desejada.";

                novoEstado = "informando_quantidade";
            }

        } else if (sessao.estado === "informando_quantidade") {
            const quantidade = Number(texto);

            if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 50) {
                resposta = "Digite uma quantidade inteira entre 1 e 50.";
            } else if (!dados.item_atual) {
                resposta = "Não encontrei o produto escolhido. Digite *oi* para começar novamente.";
                novoEstado = "inicio";
            } else {
                dados.item_atual.quantidade = quantidade;
                dados.itens = dados.itens || [];
                dados.itens.push(dados.item_atual);
                delete dados.item_atual;

                resposta =
                    "Item adicionado ao pedido! ✅\n\n" +
                    "Digite 1 para adicionar outro produto ou 2 para finalizar a seleção.";

                novoEstado = "adicionando_itens";
            }

        } else if (sessao.estado === "adicionando_itens" && texto === "1") {
            const produtos = await pool.query(
                "SELECT id, nome, preco FROM produtos ORDER BY id"
            );

            dados.produtos_disponiveis = produtos.rows;

            resposta =
                "🍨 Escolha outro produto:\n\n" +
                produtos.rows
                    .map((p, i) =>
                        `${i + 1} - ${p.nome} - R$ ${Number(p.preco).toFixed(2)}`
                    )
                    .join("\n") +
                "\n\nDigite o número do produto.";

            novoEstado = "escolhendo_produto";

        } else if (sessao.estado === "adicionando_itens" && texto === "2") {
            const itens = dados.itens || [];

            if (itens.length === 0) {
                resposta = "Seu pedido ainda não tem itens. Digite 1 para escolher um produto.";
                novoEstado = "inicio";
            } else {
                const total = itens.reduce(
                    (soma, item) => soma + item.preco * item.quantidade,
                    0
                );

                resposta =
                    "🛒 Resumo do pedido:\n\n" +
                    itens.map(item =>
                        `${item.quantidade}x ${item.produto} - R$ ${(item.preco * item.quantidade).toFixed(2)}`
                    ).join("\n") +
                    `\n\nTotal: R$ ${total.toFixed(2)}` +
                    "\n\nA seleção foi concluída. O cadastro definitivo do pedido será implementado na próxima etapa.";

                novoEstado = "confirmando_pedido";
            }

        } else if (texto === "3") {
            resposta =
                "Para falar com um atendente, entre em contato diretamente com a equipe da sorveteria.";
        } else {
            resposta =
                "Não entendi sua mensagem. Digite *oi* para ver as opções.";
        }

        const atualizada = await pool.query(
            `UPDATE sessoes_chatbot
             SET estado = $1,
                 dados_conversa = $2,
                 data_atualizacao = CURRENT_TIMESTAMP
             WHERE id = $3
             RETURNING *`,
            [novoEstado, JSON.stringify(dados), sessao.id]
        );

        res.json({
            resposta,
            sessao: atualizada.rows[0]
        });

    } catch (erro) {
        console.error(erro);
        res.status(500).json({
            mensagem: "Erro ao processar mensagem do chatbot."
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