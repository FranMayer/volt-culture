// =====================================================
// ACCESO SECRETO AL ADMIN
// Escribir "admin" en cualquier parte de la página
// =====================================================

(function() {
    const SECRET_CODE = 'admin';
    let typedKeys = '';
    let timeout;
    
    document.addEventListener('keydown', function(e) {
        // Ignorar si está escribiendo en un input o textarea
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }
        
        // Solo letras
        if (e.key.length === 1 && e.key.match(/[a-z]/i)) {
            typedKeys += e.key.toLowerCase();
            
            // Resetear después de 2 segundos de inactividad
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                typedKeys = '';
            }, 2000);
            
            // Mantener solo los últimos caracteres necesarios
            if (typedKeys.length > SECRET_CODE.length) {
                typedKeys = typedKeys.slice(-SECRET_CODE.length);
            }
            
            // Verificar si coincide
            if (typedKeys === SECRET_CODE) {
                typedKeys = '';
                
                // Determinar la ruta correcta según la ubicación actual
                const isInSubfolder = window.location.pathname.includes('/pages/');
                const adminPath = isInSubfolder ? '../admin/panel.html' : '/admin/panel.html';
                
                // Efecto visual antes de redirigir
                showAccessGranted(adminPath);
            }
        }
    });
    
    function showAccessGranted(path) {
        // Crear overlay
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(10, 10, 10, 0.95);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 99999;
            animation: fadeIn 0.3s ease;
        `;
        
        overlay.innerHTML = `
            <div style="text-align: center;">
                <div style="
                    font-family: 'Bebas Neue', sans-serif;
                    font-size: 3rem;
                    color: #C1121F;
                    letter-spacing: 0.2em;
                    animation: glitch 0.5s ease;
                ">⚡ ACCESO AUTORIZADO</div>
                <div style="
                    color: rgba(255,255,255,0.5);
                    margin-top: 1rem;
                    font-size: 0.9rem;
                    letter-spacing: 0.1em;
                ">Redirigiendo al panel...</div>
            </div>
        `;
        
        // Agregar estilos de animación
        const style = document.createElement('style');
        style.textContent = `
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            @keyframes glitch {
                0%, 100% { transform: translate(0); }
                20% { transform: translate(-2px, 2px); }
                40% { transform: translate(2px, -2px); }
                60% { transform: translate(-2px, -2px); }
                80% { transform: translate(2px, 2px); }
            }
        `;
        document.head.appendChild(style);
        document.body.appendChild(overlay);
        
        // Redirigir después de un momento
        setTimeout(() => {
            window.location.href = path;
        }, 800);
    }
})();
