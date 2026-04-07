/**
 * MovieBox - Admin Service
 * Handles custom links, manual Hindi dubbed overrides, and analytics.
 */

const ADMIN_STORAGE_KEY = 'moviebox_admin_data';

const Admin = {
   /**
    * Get all admin-defined movie data
    */
   getAdminData() {
      const data = localStorage.getItem(ADMIN_STORAGE_KEY);
      return data ? JSON.parse(data) : {};
   },

   /**
    * Save or update data for a movie
    * @param {string} id - Movie ID
    * @param {object} updates - { customLink, isHindiDubbed }
    */
   saveMovieData(id, { customLink, isHindiDubbed }) {
      const data = this.getAdminData();
      data[id] = {
         ...(data[id] || {}),
         customLink: customLink || (data[id] && data[id].customLink),
         isHindiDubbed: isHindiDubbed !== undefined ? isHindiDubbed : (data[id] && data[id].isHindiDubbed)
      };
      localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(data));
      this.updateAdminList();
      return true;
   },

   /**
    * Get data for a specific movie
    */
   getMovieData(id) {
      const data = this.getAdminData();
      return data[id] || null;
   },

   /**
    * Delete data for a movie
    */
   deleteMovieData(id) {
      const data = this.getAdminData();
      delete data[id];
      localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(data));
      this.updateAdminList();
   },

   /**
    * Initialize Admin UI
    */
   init() {
      const adminToggle = document.getElementById('admin-toggle');
      const adminPanel = document.getElementById('admin-panel');
      const saveBtn = document.getElementById('admin-save-btn');
      const movieIdInput = document.getElementById('admin-movie-id');
      const customLinkInput = document.getElementById('admin-custom-link');
      const hindiCheckbox = document.getElementById('admin-hindi-dubbed');

      // Safety check: only add listeners if elements exist
      if (adminToggle && adminPanel) {
         adminToggle.addEventListener('click', (e) => {
            e.preventDefault();
            adminPanel.classList.toggle('active');
            this.updateAdminList();
         });
      }

      if (saveBtn) {
         saveBtn.addEventListener('click', () => {
            const id = movieIdInput.value.trim();
            const customLink = customLinkInput.value.trim();
            const isHindiDubbed = hindiCheckbox.checked;

            if (!id) {
               this.showStatus('Please enter a Movie ID', 'error');
               return;
            }

            this.saveMovieData(id, { customLink, isHindiDubbed });
            this.showStatus('Movie data saved successfully!', 'success');

            // Reset inputs
            movieIdInput.value = '';
            customLinkInput.value = '';
            hindiCheckbox.checked = false;
         });
      }

      this.updateAdminList();
   },

   /**
    * UI: Show status message
    */
   showStatus(msg, type) {
      const statusDiv = document.getElementById('admin-status');
      if (!statusDiv) return;
      statusDiv.textContent = msg;
      statusDiv.style.color = type === 'success' ? '#4caf50' : '#f44336';
      setTimeout(() => { if (statusDiv) statusDiv.textContent = ''; }, 3000);
   },

   /**
    * UI: Update list of managed movies
    */
   updateAdminList() {
      const listDiv = document.getElementById('admin-list');
      if (!listDiv) return;
      
      const data = this.getAdminData();
      const ids = Object.keys(data);

      if (ids.length === 0) {
         listDiv.innerHTML = '<p>No custom movie data defined yet.</p>';
         return;
      }

      let html = '<h3>Managed Movies</h3><ul style="list-style:none; padding:0; margin-top:1rem;">';
      ids.forEach(id => {
         const m = data[id];
         html += `
        <li style="display:flex; justify-content:space-between; padding:10px; border-bottom:1px solid #333;">
            <div>
                <strong>ID: ${id}</strong> | 
                ${m.isHindiDubbed ? '<span style="color:red">Hindi</span>' : '<span style="color:grey">Original</span>'} | 
                <a href="${m.customLink || '#'}" target="_blank" style="color:#007bff; font-size:0.8rem;">${m.customLink ? 'Custom Link' : 'No Link'}</a>
            </div>
            <button onclick="Admin.deleteMovieData('${id}')" style="background:none; border:none; color:red; cursor:pointer;"><i class="fas fa-trash"></i></button>
        </li>
      `;
      });
      html += '</ul>';
      listDiv.innerHTML = html;
   }
};

// Global reference for the delete button onclick
window.Admin = Admin;
Admin.init();
