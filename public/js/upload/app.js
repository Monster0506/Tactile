export function uploadApp() {
  return {
    fileName: 'Choose File',
    uploading: false,
    status: {
      message: '',
      type: ''
    },

    updateFileName() {
      const file = this.$refs.fileInput.files[0];
      this.fileName = file ? file.name : 'Choose File';
    },

    async uploadFile() {
      const file = this.$refs.fileInput.files[0];
      if (!file) {
        this.showStatus('Please select a file to upload.', 'error');
        return;
      }

      const formData = new FormData();
      formData.append('presentation', file);

      try {
        this.uploading = true;
        this.showStatus('Uploading and processing file...', 'info');

        const response = await fetch('/upload', {
          method: 'POST',
          body: formData,
          headers: {
            // ngrok free tier returns HTML interstitial for API calls unless this is set
            'ngrok-skip-browser-warning': '69420',
            Accept: 'application/json'
          }
        });

        const raw = await response.text();
        let result = null;
        try {
          result = raw ? JSON.parse(raw) : {};
        } catch {
          const isNgrokFail =
            response.status === 503 &&
            /ngrok|ERR_NGROK|incomplete HTTP response/i.test(raw);
          const hint = isNgrokFail
            ? 'Ngrok could not get a valid HTTP response from your app (often ERR_NGROK_3004). Point the tunnel at the same protocol as the server: for a typical Node app use ngrok http http://127.0.0.1:PORT; if you serve HTTPS locally use ngrok http https://127.0.0.1:PORT. Confirm the server is running and the port matches.'
            : raw.trimStart().startsWith('<')
              ? 'Upload returned a web page instead of data (ngrok warning, timeout, or proxy). Try again; use localhost if it persists.'
              : `Invalid response (HTTP ${response.status}).`;
          this.showStatus(hint, 'error');
          console.error('Upload non-JSON response:', response.status, raw.slice(0, 500));
          return;
        }

        if (response.ok) {
          this.showStatus('Upload successful! Redirecting to presentation...', 'success');
          setTimeout(() => {
            window.location.href = result.url;
          }, 2000);
        } else {
          this.showStatus(result.error || 'Upload failed', 'error');
        }
      } catch (error) {
        this.showStatus('Network error. Please try again.', 'error');
        console.error('Upload error:', error);
      } finally {
        this.uploading = false;
      }
    },

    showStatus(message, type) {
      this.status = { message, type };

      if (type === 'success') {
        setTimeout(() => {
          this.status = { message: '', type: '' };
        }, 3000);
      }
    }
  };
}
