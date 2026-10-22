module.exports = (req, res) => {
  // Vercel Environment Variable se link uthayega
  const resumeUrl = process.env.RESUME_URL || 'https://drive.google.com/file/d/173FW0jxBxwJafJapRmkyZjyjMNDnNvYN/view?usp=sharing';
  
  // 307 Temporary Redirect - taaki browser purani link ko cache na kare
  res.writeHead(307, { Location: resumeUrl });
  res.end();
};
