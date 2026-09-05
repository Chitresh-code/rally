import nodemailer from "nodemailer";

export async function sendMail(to: string, subject: string, text: string) {
  const transport = nodemailer.createTransport(process.env.EMAIL_SERVER);
  await transport.sendMail({ to, from: process.env.EMAIL_FROM, subject, text });
}
