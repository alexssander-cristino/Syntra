
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'syntra-privacy-preferences-v1';

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);

      if (!saved) {
        setVisible(true);
        return;
      }

      const preferences = JSON.parse(saved);

      if (preferences?.necessary !== true) {
        setVisible(true);
      }
    } catch {
      setVisible(true);
    }
  }, []);

  function savePreferences() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          necessary: true,
          analytics: false,
          marketing: false,
          updatedAt: new Date().toISOString()
        })
      );

      setVisible(false);
      setShowSettings(false);
    } catch {
      // Se o armazenamento estiver indisponível,
      // mantemos o painel aberto para não fingir que salvou.
      setShowSettings(true);
    }
  }

  if (!visible) {
    return (
      <button
        type="button"
        className="cookie-reopen"
        onClick={() => {
          setShowSettings(true);
          setVisible(true);
        }}
      >
        Privacidade e cookies
      </button>
    );
  }

  return (
    <div className="cookie-backdrop">
      <section
        className="cookie-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cookie-title"
      >
        <div className="cookie-icon">
          <span aria-hidden="true">◈</span>
        </div>

        <h2 id="cookie-title">
          Sua privacidade importa
        </h2>

        <p>
          O Syntra utiliza armazenamento essencial para manter
          sua sessão e proteger sua conta. Cookies opcionais de
          análise e publicidade ficam desativados por padrão.
        </p>

        <div className="cookie-details">
          <div>
            <strong>Cookies essenciais</strong>
            <span>Necessários para autenticação e segurança.</span>
            <small>Sempre ativos</small>
          </div>

          {showSettings && (
            <>
              <div>
                <strong>Análise de uso</strong>
                <span>
                  Não ativada. Nenhum serviço de análise é
                  autorizado por esta preferência.
                </span>
                <small>Desativada</small>
              </div>

              <div>
                <strong>Publicidade</strong>
                <span>
                  Não ativada. Nenhum cookie publicitário
                  opcional é autorizado por esta preferência.
                </span>
                <small>Desativada</small>
              </div>
            </>
          )}
        </div>

        <p className="cookie-policy-links">
          <a href="/privacy.html">Privacidade</a>
          <span>·</span>
          <a href="/cookies.html">Política de cookies</a>
          <span>·</span>
          <a href="/terms.html">Termos de uso</a>
        </p>

        <div className="cookie-actions">
          <button
            type="button"
            className="cookie-secondary"
            onClick={() => {
              setShowSettings(value => !value);
            }}
          >
            {showSettings
              ? 'Ocultar detalhes'
              : 'Ver preferências'}
          </button>

          <button
            type="button"
            className="cookie-primary"
            onClick={savePreferences}
          >
            Entendi e continuar
          </button>
        </div>
      </section>
    </div>
  );
}
