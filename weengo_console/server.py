import http.server
import socketserver
import os
import sys
import json
import urllib.parse

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

PORT = 7799
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONSOLE_DIR = os.path.dirname(os.path.abspath(__file__))
MACCABI_DIR = os.path.join(BASE_DIR, "НАСТОЛЬНЫЙ ФУТБОЛ MACCABI MINI")
REVIEW_DIR = os.path.join(MACCABI_DIR, "REVIEW")
DATA_FILE = os.path.join(CONSOLE_DIR, "maccabi_review_data.json")

class WeengoHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=CONSOLE_DIR, **kwargs)

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        
        # API: get list of products
        if path == "/api/products":
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            
            ignore = {'.agents', '.cursor', '_ARCHIVE', '_TEMPLATES', 'weengo_console', 'design_systems', 'MARKETING_PROMTS', 'ОТЗЫВЫ_JUNE_2026', 'ЧЕРТЕЖИ_для_КАРТОЧЕК'}
            products = []
            for item in sorted(os.listdir(BASE_DIR)):
                ip = os.path.join(BASE_DIR, item)
                if os.path.isdir(ip) and item not in ignore and not item.startswith('.'):
                    subs = os.listdir(ip) if os.path.exists(ip) else []
                    has_output = os.path.exists(os.path.join(ip, "_OUTPUT")) and len(os.listdir(os.path.join(ip, "_OUTPUT"))) > 0
                    has_review = os.path.exists(os.path.join(ip, "REVIEW")) and len(os.listdir(os.path.join(ip, "REVIEW"))) > 0
                    has_copy = os.path.exists(os.path.join(ip, "_COPY")) and len(os.listdir(os.path.join(ip, "_COPY"))) > 0
                    
                    status = "Готово" if has_output else ("На проверке" if has_review else ("В работе" if has_copy else "Ожидает ТТХ"))
                    cards_count = len(os.listdir(os.path.join(ip, "_OUTPUT"))) if has_output else (len(os.listdir(os.path.join(ip, "REVIEW"))) if has_review else 8)
                    
                    products.append({
                        "name": item,
                        "status": status,
                        "cards_count": cards_count,
                        "has_review": has_review,
                        "has_output": has_output,
                        "has_copy": has_copy,
                        "has_data": os.path.exists(os.path.join(ip, "_DATA"))
                    })
            self.wfile.write(json.dumps(products, ensure_ascii=False).encode('utf-8'))
            return

        # API: get review data for Maccabi Mini
        if path == "/api/review-data":
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            
            fb_path = os.path.join(MACCABI_DIR, "_DATA", "review_feedback.json")
            target_f = fb_path if os.path.exists(fb_path) else DATA_FILE
            
            if os.path.exists(target_f):
                with open(target_f, "r", encoding="utf-8") as f:
                    content = f.read()
                self.wfile.write(content.encode('utf-8'))
            else:
                self.wfile.write(b"[]")
            return

        # API: serve image from REVIEW folder
        if path.startswith("/api/image/"):
            img_name = urllib.parse.unquote(path.replace("/api/image/", ""))
            img_path = os.path.join(REVIEW_DIR, img_name)
            if os.path.exists(img_path) and os.path.isfile(img_path):
                self.send_response(200)
                self.send_header("Content-Type", "image/jpeg")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Cache-Control", "public, max-age=86400")
                self.end_headers()
                with open(img_path, "rb") as f:
                    self.wfile.write(f.read())
                return
            else:
                self.send_error(404, "Image not found")
                return

        super().do_GET()

    def do_POST(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        
        if path == "/api/save-review":
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            
            try:
                data = json.loads(body.decode('utf-8'))

                # Guard the canonical review schema from stale browser tabs.
                # Older UI builds submitted a bare array and could erase the
                # art-director source metadata, issues and task references.
                if not isinstance(data, dict) or not isinstance(data.get("slides"), list):
                    self.send_response(409)
                    self.send_header("Content-Type", "application/json; charset=utf-8")
                    self.end_headers()
                    self.wfile.write(json.dumps({
                        "status": "error",
                        "message": "Устаревший формат данных отклонён. Обновите страницу."
                    }, ensure_ascii=False).encode('utf-8'))
                    return

                meta = data.get("meta") or {}
                if meta.get("schema_version") != 2 or not meta.get("source_document"):
                    self.send_response(409)
                    self.send_header("Content-Type", "application/json; charset=utf-8")
                    self.end_headers()
                    self.wfile.write(json.dumps({
                        "status": "error",
                        "message": "Не найден источник правок арт-директора. Обновите страницу."
                    }, ensure_ascii=False).encode('utf-8'))
                    return
                
                with open(DATA_FILE, "w", encoding="utf-8") as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                
                prod_data_dir = os.path.join(MACCABI_DIR, "_DATA")
                os.makedirs(prod_data_dir, exist_ok=True)
                with open(os.path.join(prod_data_dir, "review_feedback.json"), "w", encoding="utf-8") as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"status": "ok", "message": "Feedback saved successfully"}).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"status": "error", "message": str(e)}).encode('utf-8'))
            return

        self.send_error(404, "Endpoint not found")

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), WeengoHandler) as httpd:
        print("==================================================")
        print(f"🚀 Weengo Studio Console is running at: http://localhost:{PORT}")
        print("==================================================")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")
