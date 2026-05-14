const nodemailer = require("nodemailer");

function getBooleanEnv(name, fallback = false) {
  const value = String(process.env[name] || "").trim().toLowerCase();

  if (!value) {
    return fallback;
  }

  return ["1", "true", "yes", "si"].includes(value);
}

function getAppBaseUrl() {
  return String(process.env.APP_BASE_URL || "http://localhost:3000").trim().replace(/\/+$/, "");
}

function buildVerificationUrl(token) {
  return `${getAppBaseUrl()}/verificar-correo?token=${encodeURIComponent(token)}`;
}

function isMailConfigured() {
  return Boolean(
    process.env.MAIL_HOST &&
      process.env.MAIL_PORT &&
      process.env.MAIL_FROM
  );
}

function createTransporter() {
  const transportConfig = {
    host: process.env.MAIL_HOST,
    port: Number(process.env.MAIL_PORT || 0),
    secure: getBooleanEnv("MAIL_SECURE", false)
  };

  if (process.env.MAIL_USER) {
    transportConfig.auth = {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASSWORD || ""
    };
  }

  return nodemailer.createTransport(transportConfig);
}

async function sendVerificationEmail({ email, nombre, token }) {
  const verificationUrl = buildVerificationUrl(token);

  if (!isMailConfigured()) {
    return {
      delivered: false,
      preview_url: verificationUrl,
      reason: "mail_not_configured"
    };
  }

  const transporter = createTransporter();

  await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to: email,
    subject: "Verifica tu cuenta de PapperTech",
    text: [
      `Hola ${nombre || "cliente"},`,
      "",
      "Gracias por crear tu cuenta en PapperTech.",
      "Para validar que el correo es real, abre este enlace:",
      verificationUrl,
      "",
      "Si no solicitaste esta cuenta, puedes ignorar este mensaje."
    ].join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #10233f;">
        <h2 style="margin-bottom: 8px;">Verifica tu cuenta de PapperTech</h2>
        <p>Hola ${nombre || "cliente"},</p>
        <p>Gracias por crear tu cuenta. Para validar que el correo es real, confirma tu registro desde este boton:</p>
        <p style="margin: 24px 0;">
          <a
            href="${verificationUrl}"
            style="background: #5ca8ff; color: #ffffff; text-decoration: none; padding: 12px 20px; border-radius: 10px; display: inline-block; font-weight: 700;"
          >
            Verificar correo
          </a>
        </p>
        <p>Si el boton no te funciona, copia y pega esta URL en tu navegador:</p>
        <p><a href="${verificationUrl}">${verificationUrl}</a></p>
        <p>Si no solicitaste esta cuenta, puedes ignorar este mensaje.</p>
      </div>
    `
  });

  return {
    delivered: true,
    preview_url: verificationUrl
  };
}

module.exports = {
  buildVerificationUrl,
  sendVerificationEmail
};
