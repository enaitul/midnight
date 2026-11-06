from app import create_app, socketio

app = create_app()

if __name__ == '__main__':
    # Debug is opt-in and cannot be enabled in a production environment.
    debug = app.config['APP_ENV'] == 'development' and app.config['FLASK_DEBUG']
    socketio.run(app, debug=debug, port=5000)

