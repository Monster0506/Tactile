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
          body: formData
        });

        const result = await response.json();

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
