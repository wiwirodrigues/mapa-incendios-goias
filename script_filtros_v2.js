// ============================================================================
// SCRIPT DE FILTRAGEM V27 - DISSOLVIDO LARANJA + BUFFER COLORIDO
// ============================================================================

let camadasFogo = []; 
let mapaInstancia = null;
let camadaGoias = null;
let camadasParque = [];

const CORES_ANUAIS = {
    2016: "#1f77b4", 2017: "#d62728", 2018: "#ff7f0e", 2019: "#9467bd",
    2020: "#e377c2", 2021: "#8c564b", 2022: "#bcbd22", 2023: "#17becf",
    2024: "#2ca02c", 2025: "#7f7f7f"
};

const MESES_NOMES = {
    1: "Janeiro", 2: "Fevereiro", 3: "Março", 4: "Abril",
    5: "Maio", 6: "Junho", 7: "Julho", 8: "Agosto",
    9: "Setembro", 10: "Outubro", 11: "Novembro", 12: "Dezembro"
};

const COR_PARQUE     = "#1b5e20";  // verde escuro, só borda
const COR_DISSOLVIDO = "#ff3d00";  // laranja forte

function limpar(texto) {
    if (!texto) return "";
    return texto.toString().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function ehPoligonoParque(p) {
    return (
        p.nome_uc &&
        p.FRP_buffer !== undefined &&
        !p.DataHora
    );
}

function obterOverlay(nome) {
    for (let k in window) {
        const obj = window[k];
        if (obj && obj.overlays && obj.overlays[nome]) {
            return obj.overlays[nome];
        }
    }
    return null;
}

function camadasDoOverlay(nome) {
    const overlay = obterOverlay(nome);
    const camadas = [];
    if (!overlay) return camadas;

    if (overlay.eachLayer) {
        overlay.eachLayer(l => camadas.push(l));
    } else {
        camadas.push(overlay);
    }

    return camadas;
}

function marcarTiposPorOverlay() {
    camadasParque = camadasDoOverlay("UCs");
    camadasParque.forEach(l => l._tipoFiltro = "parque");

    camadasDoOverlay("Goiás").forEach(l => {
        l._tipoFiltro = "goias";
        camadaGoias = l;
    });

    camadasDoOverlay("Buffer Dissolvido").forEach(l => l._tipoFiltro = "dissolvido");
    camadasDoOverlay("Buffer Individual").forEach(l => l._tipoFiltro = "buffer");
    camadasDoOverlay("Focos").forEach(l => l._tipoFiltro = "foco");
}

function aplicarEstiloParques() {
    camadasParque.forEach(l => {
        if (l.setStyle) {
            l.setStyle({
                color: COR_PARQUE,
                fillColor: COR_PARQUE,
                opacity: 1,
                fillOpacity: 0,
                weight: 1.5
            });
        }
        if (mapaInstancia && !mapaInstancia.hasLayer(l)) {
            mapaInstancia.addLayer(l);
        }
        if (l.bringToFront) l.bringToFront();
    });
}

function atualizarRotulosControleCamadas() {
    document.querySelectorAll('.leaflet-control-layers-overlays label').forEach(label => {
        const txt = label.textContent.trim();

        if (txt === 'UCs' || txt === 'UC' || txt === 'Goiás' || txt === 'go_uf') {
            label.style.display = 'none';
        }

        if (txt === 'Buffer Dissolvido') {
            const walker = document.createTreeWalker(label, NodeFilter.SHOW_TEXT);
            const textos = [];
            while (walker.nextNode()) textos.push(walker.currentNode);

            textos.forEach(n => {
                if (n.textContent.includes('Buffer Dissolvido')) {
                    n.textContent = n.textContent.replace('Buffer Dissolvido', 'Buffer Dissolvido Total');
                }
            });
        }
    });
}

function identificarCamada(l) {
    let content = "";
    if (l.getPopup()) {
        const c = l.getPopup().getContent();
        content = typeof c === 'string' ? c : c.innerHTML;
    } else if (l.feature && l.feature.properties) {
        content = JSON.stringify(l.feature.properties);
    }

    // --- PROTEÇÃO RADICAL: Goiás ---
    if (l._tipoFiltro === "parque") return null;
    if (l._tipoFiltro === "goias") {
        camadaGoias = l;
        return null;
    }
    if (l._tipoFiltro === "dissolvido") {
        const p = l.feature && l.feature.properties ? l.feature.properties : {};
        return {
            ano: 0,
            mes: 0,
            parque: limpar(p.nome_uc || ""),
            tipo: "dissolvido"
        };
    }

    if (content.includes("go_uf") || content.includes("NM_UF") || content.includes("SIGLA")) {
        camadaGoias = l;
        return null;
    }

    // --- PARQUES (UC): têm nome_uc e FRP_buffer mas NÃO têm DataHora ---
    // São os 12 polígonos dos parques — borda verde, nunca filtrados
    if (l.feature && l.feature.properties) {
        const p = l.feature.properties;
if (p.nome_uc && p.FRP_buffer !== undefined && !p.DataHora) {
    if (ehPoligonoParque(p)) {
        return null;
    }

    return {
        ano: 0,
        mes: 0,
        parque: limpar(p.nome_uc),
        tipo: "dissolvido"
    };
}
    }

    // --- FOCOS e BUFFER INDIVIDUAL: precisam ter FRP ou DataHora ---
    if (!content.includes("FRP") && !content.includes("DataHora")) return null;

    // Lê de properties se disponível (buffer individual tem DataHora nas properties)
    if (l.feature && l.feature.properties && l.feature.properties.DataHora) {
        const p = l.feature.properties;
        const dataStr = p.DataHora.toString();
        const anoMatch = dataStr.match(/20(1[6-9]|2[0-5])/);
        if (!anoMatch) return null;
        const ano = parseInt(anoMatch[0]);
        const mesMatch = dataStr.match(/^\d{4}[\/\-](\d{2})/);
        const mes = mesMatch ? parseInt(mesMatch[1]) : 0;
        const parque = limpar(p.nome_uc || "");
        return { ano, mes, parque, tipo: "foco" };
    }

    // Fallback: lê do popup (focos com popup)
    const text = content.replace(/<[^>]*>/g, " ");
    const anoMatch = text.match(/20(1[6-9]|2[0-5])/);
    if (!anoMatch) return null;
    const ano = parseInt(anoMatch[0]);
    const mesMatch = text.match(/Mês:?\s*(\d+)/i) || text.match(/[\/\-](\d{2})[\/\-]/);
    const mes = mesMatch ? parseInt(mesMatch[1]) : 0;
    const parqMatch = text.match(/Parque:\s+(PARQUE[^\n]+)/i);
    const parque = parqMatch ? limpar(parqMatch[1]) : "";

    return { ano, mes, parque, tipo: "foco" };
}

function atualizarContador(total, visiveis) {
    let contador = document.getElementById('contador-focos');
    if (!contador) {
        contador = document.createElement('div');
        contador.id = 'contador-focos';
        contador.style.cssText = `
            background: #f0f0f0;
            border: 1px solid #ccc;
            border-radius: 6px;
            padding: 8px 10px;
            margin-top: 10px;
            font-size: 13px;
            text-align: center;
            color: #333;
        `;
        const painel = document.getElementById('painel-filtros');
        if (painel) painel.appendChild(contador);
    }
    contador.innerHTML = `🔥 <b>${visiveis}</b> focos visíveis <span style="color:#888;">/ ${total} total</span>`;
}

function filtrarAgora() {
    const anos = Array.from(document.querySelectorAll('.ano-check:checked')).map(c => parseInt(c.value));
    const mes = document.getElementById('mes')?.value || 'All';
    const parques = Array.from(document.querySelectorAll('.parque-check:checked')).map(c => limpar(c.value));

    let totalFocos = 0;
    let focosVisiveis = 0;

    camadasFogo.forEach(item => {
        let exibir = true;

      if (item.info.tipo === "dissolvido") {
    if (item.layer.setStyle) {
        item.layer.setStyle({
            color: COR_DISSOLVIDO,
            fillColor: COR_DISSOLVIDO,
            opacity: exibir ? 1 : 0,
            fillOpacity: exibir ? 0.9 : 0,
            weight: 4
        });
    }
    return;
}

      if (item.isBuffer) {
    if (anos.length === 0 || !anos.includes(item.info.ano)) exibir = false;
    if (exibir && mes !== 'All' && item.info.mes !== parseInt(mes)) exibir = false;
    if (exibir && parques.length > 0) {
        exibir = parques.some(p => item.info.parque.includes(p) || p.includes(item.info.parque));
    }

    if (item.layer.setStyle) {
        const cor = CORES_ANUAIS[item.info.ano] || "#333";
        item.layer.setStyle({
            color: cor,
            fillColor: cor,
            opacity: exibir ? 1 : 0,
            fillOpacity: exibir ? 0.65 : 0,
            weight: 2
        });
    }
    return;
}

        // Focos: filtra por ano + mês + parque
        if (anos.length === 0 || !anos.includes(item.info.ano)) exibir = false;
        if (exibir && mes !== 'All' && item.info.mes !== parseInt(mes)) exibir = false;
        if (exibir && parques.length > 0) {
            exibir = parques.some(p => item.info.parque.includes(p) || p.includes(item.info.parque));
        }

        totalFocos++;
        if (exibir) focosVisiveis++;

        if (item.layer.setStyle) {
            item.layer.setStyle({
                opacity: exibir ? 1 : 0,
                fillOpacity: exibir ? 1 : 0
            });
        } else if (item.layer.setOpacity) {
            item.layer.setOpacity(exibir ? 1 : 0);
        }
    });

    // Goiás sempre visível, só borda
    if (camadaGoias) {
        if (camadaGoias.setStyle) {
            camadaGoias.setStyle({ opacity: 1, fillOpacity: 0, weight: 2 });
        } else if (camadaGoias.setOpacity) {
            camadaGoias.setOpacity(1);
        }
    }

    aplicarEstiloParques();
    atualizarContador(totalFocos, focosVisiveis);
}

function inicializar() {
    // Remove "UCs" e "Goiás" do menu de camadas
    atualizarRotulosControleCamadas();
    setTimeout(atualizarRotulosControleCamadas, 500);
    setTimeout(atualizarRotulosControleCamadas, 1500);

    const style = document.createElement('style');
    style.innerHTML = `#painel-filtros { width: 340px !important; } .lista-parques { height: 280px !important; }`;
    document.head.appendChild(style);

    for (let k in window) { if (k.startsWith('map_') && window[k] instanceof L.Map) { mapaInstancia = window[k]; break; } }
    if (!mapaInstancia) return;

    marcarTiposPorOverlay();
    aplicarEstiloParques();

    camadasFogo = [];
mapaInstancia.eachLayer(l => {
    const info = identificarCamada(l);
    if (info) {
        const isBuf = (l instanceof L.Path && !(l instanceof L.CircleMarker));
        const isDiss = info.tipo === "dissolvido";

        if (isDiss) {
            l.setStyle({
                color: COR_DISSOLVIDO,
                fillColor: COR_DISSOLVIDO,
                opacity: 1,
                fillOpacity: 0.9,
                weight: 4
            });
        } else if (isBuf) {
            const cor = CORES_ANUAIS[info.ano] || "#333";
            l.setStyle({
                color: cor,
                fillColor: cor,
                opacity: 1,
                fillOpacity: 0.65,
                weight: 2
            });
        }

        camadasFogo.push({
            layer: l,
            info: info,
            isBuffer: isBuf,
            isDissolvido: isDiss
        });
    }
});

// Polígonos dos parques (UC): sempre borda verde, sem preenchimento
mapaInstancia.eachLayer(l => {
    if (l.feature && l.feature.properties && l.setStyle) {
        const p = l.feature.properties;

        if (ehPoligonoParque(p)) {
            l.setStyle({
                color: COR_PARQUE,
                fillColor: COR_PARQUE,
                opacity: 1,
                fillOpacity: 0,
                weight: 1.5
            });

            if (l.bringToFront) l.bringToFront();
        }
    }
});


    // Tradução visual
    document.querySelectorAll('#painel-filtros h2, #painel-filtros label, .lista-parques label').forEach(el => {
        el.childNodes.forEach(n => { if (n.nodeType === 3) n.textContent = n.textContent.replace(/UC/g, 'Parque'); });
    });

    // Checkboxes de Ano com botão Marcar/Desmarcar todos
    const selectOriginal = document.getElementById('ano');
    if (selectOriginal && !document.getElementById('container-anos')) {
        const btnToggle = document.createElement('button');
        btnToggle.textContent = 'Desmarcar todos';
        btnToggle.style.cssText = `
            font-size: 11px; padding: 3px 8px; margin-top: 5px; margin-bottom: 4px;
            cursor: pointer; border: 1px solid #aaa; border-radius: 4px;
            background: #f5f5f5; display: block; width: 100%;
        `;
        let todosMarcados = true;

        const container = document.createElement('div');
        container.id = 'container-anos';
        container.style.cssText = 'max-height: 120px; overflow-y: auto; border: 1px solid #ccc; padding: 5px; background: white; margin-top:5px;';
        [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025].forEach(a => {
            container.innerHTML += `<label style="display:flex;align-items:center;gap:8px;font-size:12px;margin-bottom:4px;cursor:pointer;">
                <input type="checkbox" class="ano-check" value="${a}" checked> ${a}</label>`;
        });

        btnToggle.onclick = () => {
            todosMarcados = !todosMarcados;
            container.querySelectorAll('.ano-check').forEach(i => i.checked = todosMarcados);
            btnToggle.textContent = todosMarcados ? 'Desmarcar todos' : 'Marcar todos';
            filtrarAgora();
        };

        selectOriginal.style.display = 'none';
        selectOriginal.parentNode.insertBefore(btnToggle, selectOriginal.nextSibling);
        selectOriginal.parentNode.insertBefore(container, btnToggle.nextSibling);
        container.querySelectorAll('input').forEach(i => i.onchange = () => {
            const total = container.querySelectorAll('.ano-check').length;
            const marcados = container.querySelectorAll('.ano-check:checked').length;
            todosMarcados = marcados === total;
            btnToggle.textContent = todosMarcados ? 'Desmarcar todos' : 'Marcar todos';
            filtrarAgora();
        });
    }

    // Meses por extenso
    const selectMes = document.getElementById('mes');
    if (selectMes) {
        Array.from(selectMes.options).forEach(opt => {
            const num = parseInt(opt.value);
            if (!isNaN(num) && MESES_NOMES[num]) {
                opt.textContent = MESES_NOMES[num];
                opt.value = num;
            }
        });
        selectMes.onchange = filtrarAgora;
    }

    document.querySelectorAll('.parque-check').forEach(c => c.onchange = filtrarAgora);

    // Desliga buffers no início
    document.querySelectorAll('.leaflet-control-layers-selector').forEach(i => {
        const texto = i.nextSibling.textContent.toLowerCase();
        if (texto.includes('buffer') && i.checked) i.click();
    });

    filtrarAgora();
}

window.addEventListener('load', () => setTimeout(inicializar, 3500));
