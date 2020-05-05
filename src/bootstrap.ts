import {config as loadenv, load} from "dotenv"
import {join} from "path"

loadenv({path: join(__dirname, '../.env')})
