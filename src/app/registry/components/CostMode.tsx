"use client";
/* Режим «Нагрузка» (cost-management, SCM). costData — общий с «Методикой», живёт в page. */
import { useEffect, useState } from "react";
import { fmtKzt, minShort, PARAM_FIELDS, paramsToForm, formToParams, type Req } from "../lib";

export default function CostMode({ costData, setCostData, onOpen }:
  { costData: any; setCostData: (d: any) => void; onOpen: (r: Req) => void }) {
  const [costParams, setCostParams] = useState<Record<string, string>>({});
  const [paramsSaving, setParamsSaving] = useState(false);
  useEffect(() => { if (costData) setCostParams(paramsToForm(costData.params)); }, [costData]);

  const saveCostParams = () => {
    setParamsSaving(true);
    fetch("/api/registry/cost/params", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(formToParams(costParams)) })
      .then((r) => r.json())
      .then(() => fetch("/api/registry/cost").then((r) => r.json()))
      .then((d) => setCostData(d))
      .finally(() => setParamsSaving(false));
  };

  return (
    <div className="reg-biz">
      <div className="reg-biz-hero">
        <h1>Регуляторная нагрузка на бизнес</h1>
        <p>Оценка стоимости выполнения требований по модели Standard Cost Model (₸/год). Параметры настраиваемые; время и частота — предварительная ИИ-оценка.</p>
      </div>
      {!costData ? <div className="reg-empty">Загрузка…</div> : (
        <>
          <div className="reg-cost-summary">
            <div className="reg-cost-stat"><b>{fmtKzt(costData.medianPerEntity)}</b><span>медианная стоимость выполнения требования (₸/субъект/год)</span></div>
            <div className="reg-cost-stat"><b>{Number(costData.count).toLocaleString("ru")}</b><span>оценённых требований</span></div>
            <div className="reg-cost-stat"><b>{Number(costData.withExternal).toLocaleString("ru")}</b><span>с пошлинами / внешними расходами</span></div>
          </div>

          {/* Настраиваемые параметры расчёта — смена пересчитывает всё мгновенно (view) */}
          <div className="reg-cost-params">
            <div className="reg-cost-params-h">
              <span>Параметры расчёта</span>
              <span className="reg-cost-hint">Значения по умолчанию — БНС / Standard Cost Model. Измените любой — стоимость пересчитается для всех требований.</span>
            </div>
            <div className="reg-cost-params-grid">
              {PARAM_FIELDS.map((fld) => (
                <label key={fld.k} className="reg-cost-param">
                  <span className="reg-cost-param-l">{fld.label}</span>
                  <span className="reg-cost-param-in">
                    <input type="number" step={fld.step || "1"} value={costParams[fld.k] ?? ""}
                      onChange={(e) => setCostParams((p) => ({ ...p, [fld.k]: e.target.value }))} />
                    <i>{fld.unit}</i>
                  </span>
                </label>
              ))}
            </div>
            <button className="reg-cost-apply" onClick={saveCostParams} disabled={paramsSaving}>
              {paramsSaving ? "Пересчёт…" : "Применить и пересчитать"}
            </button>
          </div>

          {/* Стоимость проверок — зависит от «часа проверки» и трудозатрат на сопровождение */}
          {Number(costData.withInspection) > 0 && (
            <>
              <div className="reg-biz-blockh reg-biz-blockh-lg">Стоимость проверок<span className="reg-biz-blockh-cnt">{Number(costData.withInspection).toLocaleString("ru")} требований с выездной проверкой</span></div>
              <div className="reg-cost-summary">
                <div className="reg-cost-stat"><b>{fmtKzt(costData.medianInspGov)}</b><span>стоимость проверки государству — медиана (₸)</span></div>
                <div className="reg-cost-stat"><b>{fmtKzt(costData.avgInspGov)}</b><span>стоимость проверки государству — средняя (₸)</span></div>
                <div className="reg-cost-stat"><b>{fmtKzt(costData.avgInspBiz)}</b><span>сопровождение проверки бизнесом — средняя (₸)</span></div>
              </div>
            </>
          )}

          <div className="reg-biz-blockh reg-biz-blockh-lg">Средняя стоимость требования по органам<span className="reg-biz-blockh-cnt">₸/субъект/год</span></div>
          <div className="reg-cost-bars">
            {costData.byMinistry.map((m: any, i: number) => (
              <div key={i} className="reg-cost-bar">
                <span className="reg-cost-bar-l" title={m.ministry}>{minShort(m.ministry)}</span>
                <span className="reg-cost-bar-track"><span className="reg-cost-bar-fill" style={{ width: (Number(m.burden) / Number(costData.byMinistry[0]?.burden || 1) * 100).toFixed(1) + "%" }} /></span>
                <span className="reg-cost-bar-v">{fmtKzt(Number(m.burden))}</span>
              </div>
            ))}
          </div>

          <div className="reg-biz-blockh reg-biz-blockh-lg">Топ-50 самых дорогих требований<span className="reg-biz-blockh-cnt">₸ на субъект / год</span></div>
          <div className="reg-cost-table">
            {costData.top.map((r: any) => (
              <div key={r.id} className="reg-cost-row" onClick={() => onOpen(r)}>
                <span className="reg-cost-row-t">{r.title}</span>
                <span className="reg-cost-row-meta">{minShort(r.ministry)} · {r.action_type} · {Number(r.time_hours)}ч ×{Number(r.frequency_per_year)}/год{Number(r.external_cost_kzt) > 0 ? ` · пошлина ${fmtKzt(Number(r.external_cost_kzt))}` : ""}</span>
                <span className="reg-cost-row-v">{fmtKzt(Number(r.cost_per_entity_kzt))}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
