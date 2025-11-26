import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const QRScan = sequelize.define('QRScan', {
    scan_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    table_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'tables',
        key: 'table_id'
      },
      onDelete: 'CASCADE'
    },
    scanned_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    ip_address: {
      type: DataTypes.INET,
      allowNull: true
    },
    user_agent: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    tableName: 'qr_scans',
    timestamps: false,
    indexes: [
      { fields: ['table_id'] },
      { fields: ['scanned_at'] }
    ]
  });

  return QRScan;
};