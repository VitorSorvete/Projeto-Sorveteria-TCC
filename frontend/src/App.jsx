import { useEffect, useState } from "react";
import "./App.css";

function App() {
  const [pedidos, setPedidos] = useState([]);

  const [produtos, setProdutos] = useState([]);
  const [sabores, setSabores] = useState([]);

  const [form, setForm] = useState({
    cliente: "",
    telefone: "",
    endereco: "",
    produto: "",
    sabor: "",
    tamanho: "500ml",
    quantidade: 1,
    forma_pagamento: "Pix",
  });

  function carregarPedidos() {
    fetch("http://localhost:3000/pedidos")
      .then((res) => res.json())
      .then((dados) => {
        setPedidos(dados);
      })
      .catch((erro) => {
        console.error("Erro ao buscar pedidos:", erro);
      });
  }

  useEffect(() => {
    carregarPedidos();

    fetch("http://localhost:3000/produtos")
      .then(res => res.json())
      .then(setProdutos);

    fetch("http://localhost:3000/sabores")
      .then(res => res.json())
      .then(setSabores);
  }, []);

  function alterarStatus(id, novoStatus) {
    fetch(`http://localhost:3000/pedidos/${id}/status`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        status: novoStatus,
      }),
    })
      .then((res) => res.json())
      .then(() => {
        carregarPedidos();
      })
      .catch((erro) => {
        console.error("Erro ao alterar status:", erro);
      });
  }
  function proximoStatus(status) {
    switch (status) {
      case "Recebido":
        return {
          status: "Preparando",
          texto: "▶ Iniciar preparação",
        };

      case "Preparando":
        return {
          status: "Pronto",
          texto: "✓ Marcar como pronto",
        };

      case "Pronto":
        return {
          status: "Em entrega",
          texto: "🚚 Enviar para entrega",
        };

      case "Em entrega":
        return {
          status: "Entregue",
          texto: "✓ Confirmar entrega",
        };

      default:
        return null;
    }
  }
  function cadastrarPedido(e) {
    e.preventDefault();

    fetch("http://localhost:3000/pedidos", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        cliente: form.cliente,
        telefone: form.telefone,
        endereco: form.endereco,
        produto: form.produto,
        sabor: form.sabor,
        tamanho: form.tamanho,
        quantidade: Number(form.quantidade),
        forma_pagamento: form.forma_pagamento,
      }),
    })
      .then((res) => res.json())
      .then((dados) => {
        console.log("Pedido criado:", dados);

        carregarPedidos();

        setForm({
          cliente: "",
          telefone: "",
          endereco: "",
          produto: "",
          sabor: "",
          tamanho: "500ml",
          quantidade: 1,
          forma_pagamento: "Pix",
        });
      })
      .catch((erro) => {
        console.error("Erro ao cadastrar pedido:", erro);
      });
  }
  return (
    <div className="app">
      <header className="cabecalho">
        <div>
          <h1>🍦 Painel da Sorveteria</h1>
          <p>Gerenciamento dos pedidos</p>
        </div>

        <div className="contador">
          <span>{pedidos.length}</span>
          <small>Pedidos</small>
        </div>
      </header>

      <main>
        <div className="formulario">

          <h2>➕ Novo Pedido</h2>

          <div className="grid">

            <input
              placeholder="Nome do cliente"
              value={form.cliente}
              onChange={(e) =>
                setForm({ ...form, cliente: e.target.value })
              }
            />

            <input
              placeholder="Telefone"
              value={form.telefone}
              onChange={(e) =>
                setForm({ ...form, telefone: e.target.value })
              }
            />

            <input
              placeholder="Endereço"
              value={form.endereco}
              onChange={(e) =>
                setForm({ ...form, endereco: e.target.value })
              }
            />

            <select
              value={form.produto}
              onChange={(e) =>
                setForm({ ...form, produto: e.target.value })
              }
            >
              <option value="">Selecione o produto</option>

              {produtos.map((p) => (
                <option key={p.id}>{p.nome}</option>
              ))}
            </select>

            <select
              value={form.sabor}
              onChange={(e) =>
                setForm({ ...form, sabor: e.target.value })
              }
            >
              <option value="">Selecione o sabor</option>

              {sabores.map((s) => (
                <option key={s.id}>{s.nome}</option>
              ))}
            </select>

            <select
              value={form.tamanho}
              onChange={(e) =>
                setForm({ ...form, tamanho: e.target.value })
              }
            >
              <option>300ml</option>
              <option>500ml</option>
              <option>700ml</option>
            </select>

            <input
              type="number"
              min="1"
              value={form.quantidade}
              onChange={(e) =>
                setForm({ ...form, quantidade: e.target.value })
              }
            />

            <select
              value={form.forma_pagamento}
              onChange={(e) =>
                setForm({
                  ...form,
                  forma_pagamento: e.target.value,
                })
              }
            >
              <option>Pix</option>
              <option>Cartão</option>
              <option>Dinheiro</option>
            </select>

          </div>

          <button
            className="btn-cadastrar"
            onClick={cadastrarPedido}
          >
            Cadastrar Pedido
          </button>

        </div>
        <h2>Pedidos recebidos</h2>

        {pedidos.length === 0 ? (
          <div className="sem-pedidos">
            <p>Nenhum pedido encontrado.</p>
          </div>
        ) : (
          <div className="lista-pedidos">
            {pedidos.map((pedido) => (
              <div className="card-pedido" key={pedido.id}>
                <div className="card-topo">
                  <h3>Pedido #{pedido.id}</h3>

                  <span className="status">
                    {pedido.status}
                  </span>
                </div>

                <div className="informacoes">
                  <p>
                    <strong>👤 Cliente:</strong> {pedido.cliente}
                  </p>

                  <p>
                    <strong>📱 Telefone:</strong> {pedido.telefone}
                  </p>

                  <p>
                    <strong>📍 Endereço:</strong> {pedido.endereco}
                  </p>

                  <p>
                    <strong>💳 Pagamento:</strong> {pedido.forma_pagamento}
                  </p>
                  <div className="itens-pedido">
                    <h4>🛒 Itens do pedido</h4>

                    {pedido.itens.map((item, index) => (
                      <div className="item" key={index}>
                        <strong>
                          {item.quantidade}x {item.produto}
                        </strong>

                        <span>
                          {item.sabor && ` • ${item.sabor}`}
                          {item.tamanho && ` • ${item.tamanho}`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="card-rodape">
                  <strong>
                    Total: R$ {Number(pedido.valor_total).toFixed(2)}
                  </strong>

                  <span>
                    {new Date(pedido.data_hora).toLocaleString("pt-BR")}
                  </span>
                </div>

                <div className="acoes">
                  {proximoStatus(pedido.status) ? (
                    <button
                      onClick={() =>
                        alterarStatus(
                          pedido.id,
                          proximoStatus(pedido.status).status
                        )
                      }
                    >
                      {proximoStatus(pedido.status).texto}
                    </button>
                  ) : (
                    <span className="pedido-finalizado">
                      ✓ Pedido entregue
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;