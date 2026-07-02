"use client";
/* Режим «Методика»: интерактивный SCM-калькулятор + источники методики. costData из page. */
import { useState } from "react";
import { fmtKzt } from "../lib";

export default function MethodMode({ costData }: { costData: any }) {
  const [mWage, setMWage] = useState(441998);
  const [mTime, setMTime] = useState(2);
  const [mFreq, setMFreq] = useState(12);
  const [mRole, setMRole] = useState("specialist");

  const P: any = costData?.params || {};
  const HRS = Number(P.hours_per_month ?? 160);
  const ONC = 1 + Number(P.on_costs ?? 0.175);
  const OVH = 1 + Number(P.overhead ?? 0.30);
  const RM: Record<string, number> = { clerical: Number(P.mult_clerical ?? 0.8), specialist: Number(P.mult_specialist ?? 1), manager: Number(P.mult_manager ?? 1.4) };
  const SUBJ = 2181112;
  const rmv = RM[mRole] ?? 1;
  const tariff = (mWage / HRS) * ONC * OVH * rmv;
  const perEntity = tariff * mTime * mFreq;
  const total = perEntity * SUBJ;
  const ru = (n: number) => Math.round(n).toLocaleString("ru-RU");
  const cf = (n: number, d: number) => n.toFixed(d).replace(".", ",");

  return (
    <div className="reg-biz">
      <div className="reg-biz-hero">
        <h1>Методика расчёта регуляторной нагрузки</h1>
        <p>Стоимость каждого требования считается по международной модели Standard Cost Model. Покрутите параметры — видно, из чего складывается нагрузка. Коэффициенты берутся из живых настроек реестра (раздел «Нагрузка»).</p>
      </div>

      <div className="reg-mtd-f">
        <div><span className="reg-mtd-lbl">Тариф часа труда (₸/ч) — полная стоимость часа специалиста</span>
          = (зарплата <span className="reg-mtd-v">{ru(mWage)}</span> ₸ <span className="reg-mtd-op">÷</span> <span className="reg-mtd-c">{HRS} ч</span>)
          <span className="reg-mtd-op">×</span> <span className="reg-mtd-c">{cf(ONC, 3)}</span> <span className="reg-mtd-x">соц.</span>
          <span className="reg-mtd-op">×</span> <span className="reg-mtd-c">{cf(OVH, 2)}</span> <span className="reg-mtd-x">накл.</span>
          <span className="reg-mtd-op">×</span> <span className="reg-mtd-v">{cf(rmv, 1)}</span> <span className="reg-mtd-x">роль</span>
          <span className="reg-mtd-op">=</span> <span className="reg-mtd-res">{ru(tariff)}</span> ₸/ч</div>
        <div style={{ marginTop: 6 }}><span className="reg-mtd-lbl">Стоимость на 1 субъект (₸/год) — нагрузка на один бизнес</span>
          = (<span className="reg-mtd-res">{ru(tariff)}</span> ₸/ч <span className="reg-mtd-op">×</span> <span className="reg-mtd-v">{cf(mTime, 1)}</span> ч)
          <span className="reg-mtd-op">×</span> <span className="reg-mtd-v">{mFreq}</span> раз/год
          <span className="reg-mtd-op">=</span> <span className="reg-mtd-res">{ru(perEntity)}</span> ₸/год</div>
      </div>

      <div className="reg-mtd-controls">
        <div className="reg-mtd-row"><label>Зарплата в отрасли, ₸/мес</label>
          <input type="range" min={200000} max={1200000} step={1000} value={mWage} onChange={(e) => setMWage(Number(e.target.value))} />
          <output>{ru(mWage)}</output></div>
        <div className="reg-mtd-row"><label>Время на выполнение</label>
          <input type="range" min={0.5} max={40} step={0.5} value={mTime} onChange={(e) => setMTime(Number(e.target.value))} />
          <output>{cf(mTime, 1)} ч</output></div>
        <div className="reg-mtd-row"><label>Частота</label>
          <input type="range" min={1} max={52} step={1} value={mFreq} onChange={(e) => setMFreq(Number(e.target.value))} />
          <output>{mFreq}/год</output></div>
        <div className="reg-mtd-row"><label>Категория исполнителя</label>
          <select value={mRole} onChange={(e) => setMRole(e.target.value)}>
            <option value="clerical">Делопроизводитель (×{cf(RM.clerical, 1)})</option>
            <option value="specialist">Специалист (×{cf(RM.specialist, 1)})</option>
            <option value="manager">Руководитель (×{cf(RM.manager, 1)})</option>
          </select>
          <output>×{cf(rmv, 1)}</output></div>
      </div>

      <div className="reg-cost-summary" style={{ marginTop: 18 }}>
        <div className="reg-cost-stat"><b>{ru(tariff)} ₸</b><span>тариф часа труда</span></div>
        <div className="reg-cost-stat"><b>{ru(perEntity)} ₸</b><span>нагрузка на субъект / год</span></div>
        <div className="reg-cost-stat"><b>{fmtKzt(total)}</b><span>суммарно по МСБ / год · одно требование × 2,18 млн</span></div>
      </div>

      <div className="reg-biz-blockh reg-biz-blockh-lg">На опыте каких стран построена методика<span className="reg-biz-blockh-cnt">международные практики</span></div>
      <div className="reg-mtd-prov">
        <div className="reg-mtd-card">
          <h4>Standard Cost Model</h4>
          <span className="reg-mtd-tag reg-mtd-t-core">Ядро формулы · Нидерланды, ЕС</span>
          <p>Само уравнение «Стоимость = Цена × Количество» и структура тарифа (зарплата + надбавки + накладные). Родина — Нидерланды, сеть SCM Network с 2003 г.</p>
          <div className="reg-mtd-fact">NL: админбремя €16,4 млрд/год ≈ 3,6% ВВП; применяют Дания, Норвегия, Швеция, Великобритания.</div>
        </div>
        <div className="reg-mtd-card">
          <h4>RBMF</h4>
          <span className="reg-mtd-tag reg-mtd-t-ext">Расширение · Австралия</span>
          <p>Деление издержек на 3 типа: административные, существенные (оборудование, обучение) и издержки задержки. Множитель надбавок к зарплате.</p>
          <div className="reg-mtd-fact">Office of Impact Analysis: $48,67/ч × 1,75 = $85,17/ч.</div>
        </div>
        <div className="reg-mtd-card">
          <h4>One-for-one rule</h4>
          <span className="reg-mtd-tag reg-mtd-t-ext">Расширение · Канада</span>
          <p>Дисконтированная SCM-формула (ставка 7%) и принцип «одно требование вошло — одно вышло» для сдерживания роста нагрузки.</p>
          <div className="reg-mtd-fact">Red Tape Reduction Act, 2015. В ЕС аналог «one-in-one-out» с 2022 г.</div>
        </div>
        <div className="reg-mtd-card">
          <h4>Bürokratiekostenindex</h4>
          <span className="reg-mtd-tag reg-mtd-t-ext">Расширение · Германия</span>
          <p>Индекс динамики бюрократических издержек на базе SCM — отслеживать рост или снижение совокупной нагрузки во времени.</p>
          <div className="reg-mtd-fact">Ведётся Statistisches Bundesamt; база для цели сокращения нагрузки.</div>
        </div>
        <div className="reg-mtd-card">
          <h4>Регуляторная гильотина</h4>
          <span className="reg-mtd-tag reg-mtd-t-cut">Поиск дублей · Корея, Хорватия</span>
          <p>Массовый пересмотр: каждое требование классифицируется «оставить / упростить / отменить» по чек-листу (законность, нужность, бизнес-дружелюбность).</p>
          <div className="reg-mtd-fact">Методология Jacobs, Cordova &amp; Associates. Корея 1998–99: 11 000+ норм за 11 мес, отменено ≈50%.</div>
        </div>
        <div className="reg-mtd-card">
          <h4>OECD</h4>
          <span className="reg-mtd-tag reg-mtd-t-fr">Рамка качества · международная</span>
          <p>Принципы: измерять и административные, и существенные издержки; пропорциональность (больше доказательств — для весомых норм) и риск-ориентированный контроль.</p>
          <div className="reg-mtd-fact">Regulatory Policy Outlook 2025, команда Measuring Regulatory Performance.</div>
        </div>
      </div>

      <div className="reg-biz-blockh reg-biz-blockh-lg">Как реестр находит дубли<span className="reg-biz-blockh-cnt">три уровня</span></div>
      <div className="reg-mtd-steps">
        <div className="reg-mtd-step">
          <div className="reg-mtd-step-n">1</div>
          <h4>Структурный фильтр</h4>
          <p>Сравнение по полям карточки: сектор (сфера), орган, ОКЭД, тип обязательства, ссылка на НПА. Разводит процедурно похожие действия из разных секторов.</p>
        </div>
        <div className="reg-mtd-step">
          <div className="reg-mtd-step-n">2</div>
          <h4>Семантический</h4>
          <p>Эмбеддинги bge-m3 + косинусное сходство (порог ≈0,93) — ловит совпадения по смыслу даже при разной формулировке, внутри одного сектора.</p>
        </div>
        <div className="reg-mtd-step">
          <div className="reg-mtd-step-n">3</div>
          <h4>Гильотина</h4>
          <p>Совпадения классифицируются по чек-листу (законность, нужность, бизнес-дружелюбность). Приоритет — кросс-орган.</p>
          <div className="reg-mtd-guill"><span className="g-keep">оставить</span><span className="g-simpl">упростить</span><span className="g-cut">отменить</span></div>
        </div>
      </div>
      <div className="reg-mtd-effect">Структурный фильтр по сектору развёл <b>648 ложных кросс-секторных склеек</b> (заявления на разные лицензии в разных отраслях) — настоящих кросс-орган групп осталось <b>300</b> вместо 958.</div>
    </div>
  );
}
