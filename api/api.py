from flask import render_template, jsonify, request
import time


def register_routes(app, deps):
    config = deps['config']
    session_state = deps['session_state']
    latest_data = deps['latest_data']
    arduino_ctx = deps['arduino_ctx']
    save_config = deps['save_config']
    save_session_record = deps['save_session_record']
    list_patient_records = deps['list_patient_records']
    list_patient_sessions = deps['list_patient_sessions']
    create_patient = deps['create_patient']
    update_patient = deps['update_patient']
    delete_patient = deps['delete_patient']
    update_patient_summary = deps['update_patient_summary']
    compute_avg_bpm = deps['compute_avg_bpm']
    ArduinoReader = deps['ArduinoReader']

    @app.route('/')
    def index():
        return render_template('index.html')

    @app.route('/api/data')
    def get_data():
        try:
            blue = "\033[94m"
            reset = "\033[0m"
            print(f"[API/DATA] Temp={blue}{latest_data.get('temperature', 0):.1f}°C{reset} "
                  f"BPM={blue}{latest_data.get('bpm', 0)}{reset} "
                  f"Status={latest_data.get('status', 'Desconectado')}")
        except Exception:
            pass
        return jsonify(latest_data)

    @app.route('/api/alert/trigger')
    def trigger_alert():
        return jsonify({'success': True, 'message': 'Alerta activada'})

    @app.route('/api/ports', methods=['GET'])
    def list_ports():
        try:
            import serial.tools.list_ports
            ports = []
            for port in serial.tools.list_ports.comports():
                ports.append({
                    'device': port.device,
                    'description': port.description,
                    'manufacturer': port.manufacturer or 'Desconocido',
                    'vid': port.vid,
                    'pid': port.pid
                })
            return jsonify({'success': True, 'ports': ports})
        except Exception as e:
            return jsonify({'success': False, 'error': str(e)}), 500

    @app.route('/api/config', methods=['GET'])
    def get_config():
        reader = arduino_ctx.get('reader')
        current_port = reader.port if reader and reader.is_connected() else None
        return jsonify({
            'success': True,
            'config': {
                **config,
                'current_port': current_port
            }
        })

    @app.route('/api/config', methods=['POST'])
    def update_config():
        try:
            data = request.get_json() or {}

            if 'port' in data:
                config['port'] = data['port']
            if 'baudrate' in data:
                config['baudrate'] = int(data['baudrate'])
            if 'temp_min' in data:
                config['temp_min'] = float(data['temp_min'])
            if 'temp_max' in data:
                config['temp_max'] = float(data['temp_max'])
            if 'bpm_min' in data:
                config['bpm_min'] = int(data['bpm_min'])
            if 'bpm_max' in data:
                config['bpm_max'] = int(data['bpm_max'])
            if 'update_interval' in data:
                config['update_interval'] = int(data['update_interval'])

            save_config()

            if 'port' in data or 'baudrate' in data:
                reader = arduino_ctx.get('reader')
                if reader:
                    reader.disconnect()
                new_reader = ArduinoReader(baudrate=config['baudrate'])
                if new_reader.connect(port=config.get('port')):
                    arduino_ctx['reader'] = new_reader
                    return jsonify({'success': True, 'message': 'Configuración guardada y reconectado'})
                arduino_ctx['reader'] = new_reader
                return jsonify({'success': False, 'message': 'Configuración guardada pero no se pudo conectar'})

            return jsonify({'success': True, 'message': 'Configuración guardada'})
        except Exception as e:
            return jsonify({'success': False, 'error': str(e)}), 500

    @app.route('/api/connect', methods=['POST'])
    def connect_port():
        try:
            data = request.get_json() or {}
            port = data.get('port')
            baudrate = int(data.get('baudrate', config['baudrate']))

            reader = arduino_ctx.get('reader')
            if reader:
                reader.disconnect()

            new_reader = ArduinoReader(baudrate=baudrate)
            if new_reader.connect(port=port):
                arduino_ctx['reader'] = new_reader
                config['port'] = port
                config['baudrate'] = baudrate
                save_config()
                return jsonify({'success': True, 'message': f'Conectado a {port}'})
            arduino_ctx['reader'] = new_reader
            return jsonify({'success': False, 'message': 'No se pudo conectar al puerto'})
        except Exception as e:
            return jsonify({'success': False, 'error': str(e)}), 500

    @app.route('/api/patient/current', methods=['GET'])
    def current_patient():
        return jsonify({
            'success': True,
            'active': session_state['active'],
            'patient': session_state['patient'],
            'last_temp': session_state['last_temp'],
            'avg_bpm': compute_avg_bpm()
        })

    @app.route('/api/patient/start', methods=['POST'])
    def start_patient():
        data = request.get_json() or {}
        name = data.get('name')
        identifier = data.get('identifier')
        age = data.get('age')
        patient_db_id = data.get('patient_id')

        if not name:
            return jsonify({'success': False, 'error': 'Nombre del paciente requerido'}), 400

        session_state.clear()
        session_state.update({
            'active': True,
            'patient': {
                'name': name,
                'identifier': identifier,
                'age': age,
                'start_time': time.time()
            },
            'patient_db_id': patient_db_id,
            'bpm_sum': 0,
            'bpm_count': 0,
            'min_bpm': None,
            'max_bpm': None,
            'last_temp': latest_data.get('temperature')
        })
        return jsonify({'success': True, 'message': 'Sesión iniciada', 'patient': session_state['patient']})

    @app.route('/api/patient/end', methods=['POST'])
    def end_patient():
        if not session_state['active'] or not session_state['patient']:
            return jsonify({'success': False, 'error': 'No hay sesión activa'}), 400

        avg_bpm = compute_avg_bpm()
        last_temp = session_state['last_temp'] if session_state['last_temp'] is not None else latest_data.get('temperature')
        min_bpm = session_state.get('min_bpm')
        max_bpm = session_state.get('max_bpm')
        start_time = session_state['patient'].get('start_time')
        end_time = time.time()

        save_session_record(
            patient_id=session_state.get('patient_db_id'),
            avg_bpm=avg_bpm,
            min_bpm=min_bpm,
            max_bpm=max_bpm,
            last_temp=last_temp,
            start_at=start_time,
            end_at=end_time
        )
        if session_state.get('patient_db_id'):
            update_patient_summary(session_state['patient_db_id'], last_temp, avg_bpm)

        session_state.clear()
        session_state.update({
            'active': False,
            'patient': None,
            'patient_db_id': None,
            'bpm_sum': 0,
            'bpm_count': 0,
            'min_bpm': None,
            'max_bpm': None,
            'last_temp': None
        })

        return jsonify({
            'success': True,
            'message': 'Sesión finalizada y guardada',
            'avg_bpm': avg_bpm,
            'last_temp': last_temp,
            'min_bpm': min_bpm,
            'max_bpm': max_bpm
        })

    @app.route('/api/patient/<int:pid>/sessions', methods=['GET'])
    def patient_sessions(pid):
        try:
            limit = int(request.args.get('limit', 50))
            limit = max(1, min(limit, 200))
        except ValueError:
            limit = 50
        records = list_patient_sessions(pid, limit)
        return jsonify({'success': True, 'sessions': records})

    @app.route('/api/patient/history', methods=['GET'])
    def patient_history():
        try:
            limit = int(request.args.get('limit', 50))
            limit = max(1, min(limit, 200))
        except ValueError:
            limit = 50
        records = list_patient_records(limit)
        return jsonify({'success': True, 'records': records})

    @app.route('/api/patient', methods=['POST'])
    def create_patient_endpoint():
        data = request.get_json() or {}
        name = data.get('name')
        identifier = data.get('identifier')
        age = data.get('age')

        if not name:
            return jsonify({'success': False, 'error': 'Nombre requerido'}), 400

        pid = create_patient(name, identifier, age)
        return jsonify({'success': True, 'id': pid})

    @app.route('/api/patient/<int:pid>', methods=['PUT'])
    def update_patient_endpoint(pid):
        data = request.get_json() or {}
        name = data.get('name')
        identifier = data.get('identifier')
        age = data.get('age')

        if not name:
            return jsonify({'success': False, 'error': 'Nombre requerido'}), 400

        if not update_patient(pid, name, identifier, age):
            return jsonify({'success': False, 'error': 'Registro no encontrado'}), 404

        return jsonify({'success': True})

    @app.route('/api/patient/<int:pid>', methods=['DELETE'])
    def delete_patient_endpoint(pid):
        if not delete_patient(pid):
            return jsonify({'success': False, 'error': 'Registro no encontrado'}), 404
        return jsonify({'success': True})

    @app.route('/api/patient/list', methods=['GET'])
    def patient_list():
        try:
            limit = int(request.args.get('limit', 100))
            limit = max(1, min(limit, 200))
        except ValueError:
            limit = 100
        records = list_patient_records(limit)
        summary = [
            {
                'id': r['id'],
                'name': r['name'],
                'identifier': r['identifier'],
                'age': r['age']
            } for r in records
        ]
        return jsonify({'success': True, 'patients': summary})

    @app.route('/patients')
    def patients_page():
        return render_template('patients.html')
