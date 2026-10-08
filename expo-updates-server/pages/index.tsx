import Head from 'next/head';
import type { GetServerSideProps } from 'next';
import { createHash, timingSafeEqual } from 'crypto';
import fs from 'fs/promises';
import path from 'path';

type Release = { runtime: string; version: string; platforms: string[]; rollback: boolean; date: string | null; valid: boolean };
type Props = { releases: Release[]; configured: boolean; authorized: boolean; scanError: boolean; signed: boolean };
const equal = (a: string, b: string) => timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());

export const getServerSideProps: GetServerSideProps<Props> = async ({ req, res }) => {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  const username = process.env.DASHBOARD_USERNAME;
  const password = process.env.DASHBOARD_PASSWORD;
  const empty: Props = { releases: [], configured: !!(username && password), authorized: false, scanError: false, signed: false };
  if (!username || !password) { res.statusCode = 503; return { props: empty }; }
  const header = req.headers.authorization || '';
  const decoded = header.startsWith('Basic ') ? Buffer.from(header.slice(6), 'base64').toString('utf8') : '';
  const separator = decoded.indexOf(':');
  const userOK = equal(decoded.slice(0, separator), username);
  const passwordOK = equal(decoded.slice(separator + 1), password);
  if (separator < 0 || !userOK || !passwordOK) {
    res.statusCode = 401;
    res.setHeader('WWW-Authenticate', 'Basic realm="Expo OTA", charset="UTF-8"');
    return { props: empty };
  }
  const releases: Release[] = [];
  let scanError = false;
  const root = path.resolve('updates');
  try {
    const runtimes = await fs.readdir(root, { withFileTypes: true });
    for (const runtime of runtimes.filter(item => item.isDirectory())) {
      const versions = await fs.readdir(path.join(root, runtime.name), { withFileTypes: true });
      for (const version of versions.filter(item => item.isDirectory() && /^\d+$/.test(item.name))) {
        const folder = path.join(root, runtime.name, version.name);
        const files = await fs.readdir(folder, { withFileTypes: true });
        const regular = new Set(files.filter(item => item.isFile()).map(item => item.name));
        const rollback = regular.has('rollback');
        let platforms: string[] = [];
        let valid = rollback;
        let date: string | null = null;
        if (!rollback && regular.has('metadata.json')) {
          try {
            const metadata = JSON.parse(await fs.readFile(path.join(folder, 'metadata.json'), 'utf8'));
            platforms = ['android', 'ios'].filter(platform => !!metadata.fileMetadata?.[platform]);
            valid = platforms.length > 0 && regular.has('expoConfig.json');
            date = (await fs.stat(path.join(folder, 'metadata.json'))).birthtime.toISOString();
          } catch { valid = false; }
        }
        releases.push({ runtime: runtime.name, version: version.name, platforms, rollback, date, valid });
      }
    }
  } catch (error: any) { if (error.code !== 'ENOENT') scanError = true; }
  releases.sort((a, b) => Number(b.version) - Number(a.version));
  return { props: { releases, authorized: true, configured: true, scanError, signed: !!process.env.PRIVATE_KEY_PATH } };
};

export default function Dashboard({ releases, configured, authorized, scanError, signed }: Props) {
  const runtimes = new Set(releases.map(item => item.runtime)).size;
  return <div className="shell">
    <Head><title>Expo OTA · Painel</title><meta name="robots" content="noindex,nofollow" /></Head>
    <header><div className="brand"><span className="logo">↗</span><div>Expo OTA<small>VDigitals Lab</small></div></div><span className="badge">Servidor próprio</span></header>
    {!authorized ? <main><h1>{configured ? 'Acesso protegido' : 'Configure o acesso ao painel'}</h1><p>{configured ? 'Entre com suas credenciais na janela do navegador.' : 'Defina DASHBOARD_USERNAME e DASHBOARD_PASSWORD no ambiente do EasyPanel e reimplante o serviço.'}</p></main> :
    <main><div className="heading"><div><p className="eyebrow">VISÃO GERAL</p><h1>Atualizações do aplicativo</h1><p>Versões encontradas no armazenamento persistente do servidor.</p></div><a className="button" href="/">Atualizar lista</a></div>
      <section className="cards"><article><span>Atualizações</span><strong>{releases.length}</strong></article><article><span>Runtimes</span><strong>{runtimes}</strong></article><article><span>Assinatura OTA</span><strong className="text">{signed ? 'Caminho configurado' : 'Não configurada'}</strong></article></section>
      {scanError && <p className="warning">Não foi possível ler todo o armazenamento. Confira as permissões do volume /app/updates.</p>}
      <section className="panel"><h2>Histórico de versões</h2>{!releases.length ? <div className="empty"><span>↥</span><h3>Nenhuma atualização publicada</h3><p>O servidor ainda não possui exports do aplicativo. As versões aparecerão aqui após a publicação no volume.</p></div> :
      <div className="scroll"><table><thead><tr><th>Versão</th><th>Runtime</th><th>Plataforma</th><th>Estado dos arquivos</th><th>Data do arquivo</th></tr></thead><tbody>{releases.map(item => <tr key={item.runtime + '/' + item.version}><td><code>{item.version}</code></td><td>{item.runtime}</td><td>{item.platforms.join(' / ') || '—'}</td><td><span className={item.valid ? 'state' : 'state error'}>{item.rollback ? 'Rollback para versão embarcada' : item.valid ? 'Metadados disponíveis' : 'Export incompleto'}</span></td><td>{item.date || '—'}</td></tr>)}</tbody></table></div>}</section>
      <section className="panel info"><h2>Conectar o aplicativo</h2><p>Endereço de atualizações:</p><code>https://expo.vdigitalslab.com/api/manifest</code><p>O runtime deve corresponder ao código nativo instalado no celular. A lista de arquivos não comprova que uma atualização foi instalada.</p><p>Esta primeira versão permite consultar o armazenamento. Publicação e rollback continuam pelo fluxo de arquivos; não há upload nem geração de APK neste painel.</p></section>
    </main>}
    <style jsx>{`
      .shell{min-height:100vh;background:#f5f7fa;color:#17233b;font-family:Arial,sans-serif}header{display:flex;align-items:center;justify-content:space-between;background:white;border-bottom:1px solid #e3e8ef;padding:24px 6%}.brand{display:flex;align-items:center;gap:12px;font-weight:700;font-size:22px}.brand small{display:block;font-size:12px;color:#748096;margin-top:4px;font-weight:400}.logo{background:#173d35;color:#fff;padding:8px 12px;border-radius:12px}.badge,.state{background:#e7f3ed;color:#236147;border-radius:20px;padding:7px 12px;font-size:12px}main{max-width:1200px;margin:auto;padding:40px 24px}.heading{display:flex;align-items:center;justify-content:space-between;gap:20px}h1{font-size:32px;margin:8px 0 12px;letter-spacing:-1px}p{color:#68768d;line-height:1.7}.eyebrow{font-size:11px;letter-spacing:2px;color:#367c64}.button{background:#173d35;color:white;padding:12px 18px;border-radius:8px;text-decoration:none;white-space:nowrap}.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin:28px 0}.cards article,.panel{background:white;border:1px solid #e3e8ef;border-radius:14px;padding:24px}.cards span{color:#748096;font-size:13px}.cards strong{display:block;margin-top:16px;font-size:36px}.cards .text{font-size:18px}.panel{margin:22px 0}h2{font-size:18px;margin:0 0 20px}.empty{text-align:center;padding:40px 15px}.empty>span{font-size:35px;color:#367c64}.empty p{max-width:550px;margin:0 auto}.scroll{overflow-x:auto}table{border-collapse:collapse;width:100%;text-align:left;font-size:13px}th{color:#748096;font-weight:500}td,th{padding:16px 12px;border-bottom:1px solid #edf0f4}code{font-size:13px;overflow-wrap:anywhere}.error,.warning{background:#fff0df;color:#955d0b}.warning{padding:16px;border-radius:8px}.info p{font-size:14px}@media(max-width:700px){.cards{grid-template-columns:1fr}.heading{align-items:flex-start;flex-direction:column}h1{font-size:26px}header{padding:20px}.badge{display:none}}
    `}</style>
  </div>;
}
