
import { useEffect, useState } from "react";
import "./App.css";

function App() {
  const [pedidos, setPedidos] = useState([]);
  const [produtos, setProdutos] = useState([]);
  const [sabores, setSabores] = useState([]);
  const [itens, setItens] = useState([]);

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
      .then((dados) => setPedidos(dados))
      .catch((erro) => {
        console.error("Erro ao buscar pedidos:", erro);
      });
  }

  useEffect(() => {
    carregarPedidos();

    fetch("http://localhost:3000/produtos")
      .then((res) => res.json())
      .then(setProdutos)
      .catch((erro) => console.error("Erro ao buscar produtos:", erro));

    fetch("http://localhost:3000/sabores")
      .then((res) => res.json())
      .then(setSabores)
      .catch((erro) => console.error("Erro ao buscar sabores:", erro));
  }, []);

  function alterarStatus(id, novoStatus) {
    fetch(`http://localhost:3000/pedidos/${id}/status`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: novoStatus }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("Não foi possível alterar o status.");
        return res.json();
      })
      .then(carregarPedidos)
      .catch((erro) => console.error("Erro ao alterar status:", erro));
  }

  function proximoStatus(status) {
    switch (status) {
      case "Recebido":
        return { status: "Preparando", texto: "▶ Iniciar preparação" };
      case "Preparando":
        return { status: "Pronto", texto: "✓ Marcar como pronto" };
      case "Pronto":
        return { status: "Em entrega", texto: "🚚 Enviar para entrega" };
      case "Em entrega":
        return { status: "Entregue", texto: "✓ Confirmar entrega" };
      default:
        return null;
    }
  }

  function atualizarCampo(campo, valor) {
    setForm((atual) => ({ ...atual, [campo]: valor }));
  }

  function adicionarItem() {
    if (!form.produto) {
      alert("Selecione um produto.");
      return;
    }

    const quantidade = Number(form.quantidade);

    if (!Number.isInteger(quantidade) || quantidade < 1) {
      alert("Informe uma quantidade inteira maior que zero.");
      return;
    }

    setItens((atuais) => [
      ...atuais,
      {
        produto: form.produto,
        sabor: form.sabor,
        tamanho: form.tamanho,
        quantidade,
      },
    ]);

    setForm((atual) => ({
      ...atual,
      produto: "",
      sabor: "",
      tamanho: "500ml",
      quantidade: 1,
    }));
  }

  function removerItem(indiceRemover) {
    setItens((atuais) =>
      atuais.filter((_, indice) => indice !== indiceRemover)
    );
  }

  function cadastrarPedido(e) {
    e.preventDefault();

    if (itens.length === 0) {
      alert("Adicione pelo menos um item ao pedido.");
      return;
    }

    const dadosPedido = {
      cliente: form.cliente.trim(),
      telefone: form.telefone.trim(),
      endereco: form.endereco.trim(),
      forma_pagamento: form.forma_pagamento,
      itens,
    };

    if (
      !dadosPedido.cliente ||
      !dadosPedido.telefone ||
      !dadosPedido.endereco
    ) {
      alert("Preencha nome, telefone e endereço do cliente.");
      return;
    }

    fetch("http://localhost:3000/pedidos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dadosPedido),
    })
      .then(async (res) => {
        const dados = await res.json();

        if (!res.ok) {
          throw new Error(dados.mensagem || "Erro ao cadastrar pedido.");
        }

        return dados;
      })
      .then((dados) => {
        alert(`Pedido #${dados.pedido.id} cadastrado com sucesso!`);
        carregarPedidos();
        setItens([]);
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
        alert(erro.message);
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
        <form className="formulario" onSubmit={cadastrarPedido}>
          <h2>➕ Novo Pedido</h2>

          <div className="grid">
            <input
              placeholder="Nome do cliente"
              value={form.cliente}
              onChange={(e) => atualizarCampo("cliente", e.target.value)}
              required
            />

            <input
              placeholder="Telefone"
              value={form.telefone}
              onChange={(e) => atualizarCampo("telefone", e.target.value)}
              required
            />

            <input
              placeholder="Endereço"
              value={form.endereco}
              onChange={(e) => atualizarCampo("endereco", e.target.value)}
              required
            />

            <select
              value={form.produto}
              onChange={(e) => atualizarCampo("produto", e.target.value)}
            >
              <option value="">Selecione o produto</option>
              {produtos.map((p) => (
                <option key={p.id} value={p.nome}>
                  {p.nome}
                </option>
              ))}
            </select>

            <select
              value={form.sabor}
              onChange={(e) => atualizarCampo("sabor", e.target.value)}
            >
              <option value="">Selecione o sabor</option>
              {sabores.map((s) => (
                <option key={s.id} value={s.nome}>
                  {s.nome}
                </option>
              ))}
            </select>

            <select
              value={form.tamanho}
              onChange={(e) => atualizarCampo("tamanho", e.target.value)}
            >
              <option value="300ml">300ml</option>
              <option value="500ml">500ml</option>
              <option value="700ml">700ml</option>
            </select>

            <input
              type="number"
              min="1"
              step="1"
              value={form.quantidade}
              onChange={(e) => atualizarCampo("quantidade", e.target.value)}
              required
            />

            <select
              value={form.forma_pagamento}
              onChange={(e) =>
                atualizarCampo("forma_pagamento", e.target.value)
              }
            >
              <option>Pix</option>
              <option>Cartão</option>
              <option>Dinheiro</option>
            </select>
          </div>

          <button
            type="button"
            className="btn-cadastrar"
            onClick={adicionarItem}
          >
            + Adicionar item
          </button>

          {itens.length > 0 && (
            <div className="itens-pedido">
              <h4>🛒 Itens para este pedido</h4>

              {itens.map((item, indice) => (
                <div className="item" key={indice}>
                  <div>
                    <strong>
                      {item.quantidade}x {item.produto}
                    </strong>
                    <span>
                      {item.sabor && ` • ${item.sabor}`}
                      {item.tamanho && ` • ${item.tamanho}`}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => removerItem(indice)}
                  >
                    Remover
                  </button>
                </div>
              ))}
            </div>
          )}

          <button type="submit" className="btn-cadastrar">
            Cadastrar Pedido Completo
          </button>
        </form>

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
                  <span className="status">{pedido.status}</span>
                </div>

                <div className="informacoes">
                  <p><strong>👤 Cliente:</strong> {pedido.cliente}</p>
                  <p><strong>📱 Telefone:</strong> {pedido.telefone}</p>
                  <p><strong>📍 Endereço:</strong> {pedido.endereco}</p>
                  <p><strong>💳 Pagamento:</strong> {pedido.forma_pagamento}</p>

                  <div className="itens-pedido">
                    <h4>🛒 Itens do pedido</h4>
                    {(pedido.itens || []).map((item, indice) => (
                      <div className="item" key={indice}>
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